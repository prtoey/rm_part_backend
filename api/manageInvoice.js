const express = require("express");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");

module.exports = (app, connection, uploadOpts) => {
  const router = express.Router();
  app.use(express.json());

  function queryDatabase(query, values) {
    return new Promise((resolve, reject) => {
      connection.query(query, values, (err, results) => {
        if (err) {
          console.error("MySQL Error:", err);
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }

  router.post("/addProcess1", async (req, res) => {
    const { invoice, emp_id, incoming_date, date_p1, start, finish, total } =
      req.body;

    try {
      // Insert into process1
      const result = await queryDatabase(
        `INSERT INTO process1 (emp_id, incoming_date, date_p1, start, finish, total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [emp_id, incoming_date, date_p1, start, finish, total]
      );

      const index_p1 = result.insertId;

      await queryDatabase(
        `UPDATE invoice SET p1 = ? , status = 'none' WHERE code = ?`,
        [index_p1, invoice]
      );

      // Update invoice with process1 index
      // if (parseInt(hold) === 1) {
      //   await queryDatabase(
      //     `UPDATE invoice SET p1 = ? , status = 'hold' WHERE code = ?`,
      //     [index_p1, invoice]
      //   );
      // } else {
      //   await queryDatabase(
      //     `UPDATE invoice SET p1 = ? , status = 'none' WHERE code = ?`,
      //     [index_p1, invoice]
      //   );
      // }

      res.json({ success: true, message: "Process1 completed" });
    } catch (err) {
      res.status(500).json({ error: "Failed process1" });
    }
  });

  router.post("/addProcess2", async (req, res) => {
    const { invoice, emp_id, date_p2, start, finish, total, hold } = req.body;

    try {
      // Insert into process1
      const result = await queryDatabase(
        `INSERT INTO process2 (emp_id, date_p2, start, finish, total)
         VALUES (?, ?, ?, ?, ?)`,
        [emp_id, date_p2, start, finish, total]
      );

      const index_p2 = result.insertId;

      await queryDatabase(
        `UPDATE invoice SET p2 = ? , status = 'none' WHERE code = ?`,
        [index_p2, invoice]
      );

      // Update invoice with process1 index
      // if (parseInt(hold) === 1) {
      //   await queryDatabase(
      //     `UPDATE invoice SET p2 = ? , status = 'hold' WHERE code = ?`,
      //     [index_p2, invoice]
      //   );
      // } else {
      //   await queryDatabase(
      //     `UPDATE invoice SET p2 = ? , status = 'none' WHERE code = ?`,
      //     [index_p2, invoice]
      //   );
      // }

      res.json({ success: true, message: "Process2 completed" });
    } catch (err) {
      res.status(500).json({ error: "Failed process2" });
    }
  });

  router.post("/addProcess3", async (req, res) => {
    const { invoice, emp_id, date_p3, start, finish, total, all_material } =
      req.body;
    let tempPath = null;

    try {
      if (!req.files || !req.files.file) {
        return res.status(400).send("No file uploaded.");
      }

      const file = req.files.file;
      const uniqueName = `${Date.now()}_${file.name}`;
      tempPath = path.join(uploadOpts.tempFileDir, uniqueName);
      await file.mv(tempPath);

      // Read Excel
      const workbook = xlsx.readFile(tempPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = xlsx.utils.sheet_to_json(sheet, { header: 1 });

      // Normalize header row
      const headers = raw[0].map((h) =>
        h ? h.toString().trim().toLowerCase() : ""
      );

      const expectedHeaders = [
        "posting date",
        "material description",
        "material",
        "batch",
        "qty",
        "unit",
        "reference",
        "storage location",
        "external lot.",
      ];

      const missingHeaders = expectedHeaders.filter(
        (h) => !headers.includes(h)
      );

      if (missingHeaders.length > 0) {
        await fs.promises.unlink(tempPath).catch(() => {});
        return res.status(400).json({
          error: "Missing required columns",
          message: missingHeaders,
        });
      }

      // Insert into process3
      const result = await queryDatabase(
        `INSERT INTO process3 (emp_id, date_p3, start, finish, total)
         VALUES (?, ?, ?, ?, ?)`,
        [emp_id, date_p3, start, finish, total]
      );
      const index_p3 = result.insertId;

      // Parse rows with normalized keys
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
      const normalizedRows = rows.map((row) => {
        const newRow = {};
        for (const key in row) {
          const cleanKey = key.toString().trim().toLowerCase();
          newRow[cleanKey] = row[key];
        }
        return newRow;
      });

      const firstReference = normalizedRows[0]?.["reference"]
        ?.toString()
        .trim();
      if (firstReference !== invoice) {
        await fs.promises.unlink(tempPath).catch(() => {});
        return res.status(400).json({
          error: "Invoice mismatch",
          message: `Reference in Excel file : ${firstReference} does not match your Invoice : ${invoice}`,
        });
      }

      for (const row of normalizedRows) {
        const rawDate = row["posting date"];
        let post_date = null;

        if (rawDate) {
          if (typeof rawDate === "number") {
            const jsDate = xlsx.SSF.parse_date_code(rawDate);
            post_date = `${jsDate.y}-${String(jsDate.m).padStart(
              2,
              "0"
            )}-${String(jsDate.d).padStart(2, "0")}`;
          } else {
            const parts = rawDate.split(/[\/\-]/);
            if (parts.length === 3) {
              post_date = `${parts[2]}-${parts[1].padStart(
                2,
                "0"
              )}-${parts[0].padStart(2, "0")}`;
            }
          }
        }

        const material = (row["material"] || "").toString().trim();
        const item_code = (row["material description"] || "").toString().trim();
        const external_lot = (row["external lot."] || "").toString().trim();
        const batch = (row["batch"] || "").toString().trim();
        const quantity = parseFloat((row["qty"] || "0").toString().trim()) || 0;
        const unit = (row["unit"] || "").toString().trim();
        const reference = (row["reference"] || "").toString().trim();
        const storage = (row["storage location"] || "").toString().trim();

        // Insert into internal_lot
        const lotResult = await queryDatabase(
          `INSERT INTO internal_lot
           (batch, invoice, post_date, material_code, item_code, external_lot, quantity, unit, reference, storage_location, process, urgent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, 0)`,
          [
            batch,
            invoice,
            post_date,
            material,
            item_code,
            external_lot,
            quantity,
            unit,
            reference,
            storage,
          ]
        );
        const index_lot = lotResult.insertId;

        // Insert into data
        await queryDatabase(
          `INSERT INTO data (internal_lot, p3, p4, p5, p6, p7, p8, status)
           VALUES (?, ?, 0, 0, 0, 0, 0, 0)`,
          [index_lot, index_p3]
        );
      }

      // Update invoice status
      if (parseInt(all_material) === 1) {
        await queryDatabase(
          `UPDATE invoice SET status = 'none' , material_status = 'all' WHERE code = ?`,
          [invoice]
        );
      } else {
        await queryDatabase(
          `UPDATE invoice SET status = 'none' , material_status = 'some' WHERE code = ?`,
          [invoice]
        );
      }

      await fs.promises.unlink(tempPath).catch(() => {});
      res.json({ success: true, message: "Process3 completed successfully" });
    } catch (err) {
      console.error(err);
      if (tempPath) await fs.promises.unlink(tempPath).catch(() => {});
      res.status(500).send("Server error.");
    }
  });

  router.post("/internalLotForProcess4", async (req, res) => {
    const { invoice } = req.body;
    try {
      const result = await queryDatabase(
        `SELECT index_lot , batch 
        FROM
	    internal_lot 
        WHERE process = 3 AND invoice = ?`,
        [invoice]
      );

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch internal lot" });
    }
  });

  // **
  router.post("/addProcess4", async (req, res) => {
    const {
      invoice,
      emp_id,
      date_p4,
      start,
      finish,
      total,
      internal_lot,
      urgent,
    } = req.body;

    try {
      // Insert into process4
      const result = await queryDatabase(
        `INSERT INTO process4 (emp_id, date_p4, start, finish, total)
         VALUES (?, ?, ?, ?, ?)`,
        [emp_id, date_p4, start, finish, total]
      );
      const index_p4 = result.insertId;

      if (urgent === 1) {
        await queryDatabase(
          `UPDATE invoice SET status = 'urgent' WHERE code = ?`,
          [invoice]
        );
      }

      await queryDatabase(
        `UPDATE internal_lot
           SET urgent = ?, process = 4
           WHERE process = 3 AND invoice = ? AND index_lot = ?`,
        [urgent, invoice, internal_lot]
      );

      // Update data by index_lot
      await queryDatabase(
        `UPDATE data 
           SET p4 = ?
           WHERE internal_lot = ? AND edit = 0`,
        [index_p4, internal_lot]
      );

      res.json({ success: true, message: "Process4 completed" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed addProcess4" });
    }
  });

  router.post("/internalLotForProcess5", async (req, res) => {
    const { invoice } = req.body;
    try {
      const result = await queryDatabase(
        `SELECT index_lot , batch , urgent
        FROM
	    internal_lot 
        WHERE process = 4 AND invoice = ?`,
        [invoice]
      );

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch internal lot" });
    }
  });

  router.post("/addProcess5", async (req, res) => {
    const {
      invoice,
      emp_id,
      date_p5,
      start,
      finish,
      total,
      internal_lot,
      all_lot,
    } = req.body;

    try {
      // Insert into process5
      const result = await queryDatabase(
        `INSERT INTO process5 (emp_id, date_p5, start, finish, total)
         VALUES (?, ?, ?, ?, ?)`,
        [emp_id, date_p5, start, finish, total]
      );
      const index_p5 = result.insertId;

      if (internal_lot.length > 0) {
        if (all_lot === false) {
          // Partial lots → set urgent = 1
          await queryDatabase(
            `UPDATE internal_lot
             SET urgent = 1, process = 5
             WHERE process = 4 AND invoice = ? AND index_lot IN (?)`,
            [invoice, internal_lot]
          );

          // Invoice becomes urgent
          await queryDatabase(
            `UPDATE invoice SET status = 'urgent' WHERE code = ?`,
            [invoice]
          );
        } else {
          // all_lot = true
          // Keep urgent = 1 if already set, otherwise urgent=0
          await queryDatabase(
            `UPDATE internal_lot
             SET urgent = CASE 
                            WHEN urgent = 1 THEN 1
                            ELSE 0
                          END,
                 process = 5
             WHERE process = 4 AND invoice = ? AND index_lot IN (?)`,
            [invoice, internal_lot]
          );
        }

        await queryDatabase(
          `UPDATE data 
           SET p5 = ?
           WHERE internal_lot IN (?) AND edit = 0`,
          [index_p5, internal_lot]
        );
      }

      res.json({ success: true, message: "Process5 completed" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed addProcess5" });
    }
  });

  router.post("/internalLotForProcess6", async (req, res) => {
    const { invoice } = req.body;
    try {
      const result = await queryDatabase(
        `SELECT
            index_lot,
            internal_lot.batch,
            DATE_FORMAT(process1.incoming_date, '%d-%b-%Y') AS incoming_date,
            urgent
        FROM internal_lot
        INNER JOIN invoice 
            ON invoice.code = internal_lot.invoice
        INNER JOIN process1 
            ON process1.index_p1 = invoice.p1
        WHERE internal_lot.process = 5 AND invoice.code = ?`,
        [invoice]
      );

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch internal lot" });
    }
  });

  router.post("/addProcess6", async (req, res) => {
    const {
      invoice,
      emp_id,
      date_p6,
      internal_lot,
      confirm_by,
      start,
      finish,
      total,
      judgement,
      location,
    } = req.body;

    try {
      // Insert into process6
      const result = await queryDatabase(
        `INSERT INTO process6 (emp_id, tag_date, tag_start, tag_finish, total, confirm_by, judgement, location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [emp_id, date_p6, start, finish, total, confirm_by, judgement, location]
      );
      const index_p6 = result.insertId;

      // 2. OK / NG conditions
      if (judgement === "OK") {
        // Update internal_lot to process 6
        await queryDatabase(
          `UPDATE internal_lot SET process = 6 WHERE index_lot = ? AND invoice = ?`,
          [internal_lot, invoice]
        );

        // Update the latest row in data with p6 = 0
        await queryDatabase(
          `UPDATE data
           SET p6 = ?
           WHERE internal_lot = ? AND p6 = 0 AND edit = 0
           ORDER BY index_data DESC
           LIMIT 1`,
          [index_p6, internal_lot]
        );
      } else if (judgement === "NG") {
        // Clone the latest data row (regardless of p6 value)
        await queryDatabase(
          `INSERT INTO data (internal_lot, p3, p4, p5, p6, p7, p8, status)
           SELECT internal_lot, p3, p4, p5, ?, p7, p8, status
           FROM data
           WHERE internal_lot = ? AND edit = 0
           ORDER BY index_data DESC
           LIMIT 1`,
          [index_p6, internal_lot]
        );
      }

      res.json({ success: true, message: "Process6 completed" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed process6" });
    }
  });

  // ** Get old data for update process 4,5,6
  router.post("/oldDataForUpdate", async (req, res) => {
    const { index_lot, process } = req.body;

    try {
      let result;

      if (process === "4") {
        result = await queryDatabase(
          `SELECT
              data.index_data,
              process4.index_p4,
              process4.emp_id,
              process4.date_p4,
              process4.start AS start,
              process4.finish,
              process4.total,
              internal_lot.index_lot,
              internal_lot.batch,
              internal_lot.urgent
           FROM data
           INNER JOIN internal_lot ON internal_lot.index_lot = data.internal_lot
           INNER JOIN process4 ON process4.index_p4 = data.p4
           WHERE internal_lot.index_lot = ?
           ORDER BY data.index_data ASC
           LIMIT 1`,
          [index_lot]
        );
      } else if (process === "5") {
        result = await queryDatabase(
          `SELECT
              data.index_data,
              process5.index_p5,
              process5.emp_id,
              process5.date_p5,
              process5.start AS start,
              process5.finish,
              process5.total,
              internal_lot.index_lot,
              internal_lot.batch,
              internal_lot.urgent
           FROM data
           INNER JOIN internal_lot ON internal_lot.index_lot = data.internal_lot
           INNER JOIN process5 ON process5.index_p5 = data.p5
           WHERE internal_lot.index_lot = ?
           ORDER BY data.index_data ASC
           LIMIT 1`,
          [index_lot]
        );
      } else if (process === "6") {
        result = await queryDatabase(
          `SELECT
              data.index_data,
              process6.index_p6,
              process6.emp_id,
              process6.tag_date AS date_p6,
              process6.tag_start AS start,
              process6.tag_finish,
              process6.total,
              internal_lot.index_lot,
              internal_lot.batch,
              DATE_FORMAT(process1.incoming_date, '%d-%b-%Y') AS incoming_date,
              process6.confirm_by,
              process6.judgement,
              process6.location
           FROM data
           INNER JOIN internal_lot ON internal_lot.index_lot = data.internal_lot
           INNER JOIN invoice ON invoice.code = internal_lot.invoice
           INNER JOIN process1 ON process1.index_p1 = invoice.p1
           INNER JOIN process6 ON process6.index_p6 = data.p6
           WHERE internal_lot.index_lot = ?
           ORDER BY data.index_data ASC
           LIMIT 1`,
          [index_lot]
        );
      }

      res.json(result);
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: "Failed oldDataForUpdate", details: err.message });
    }
  });

  // **
  router.post("/updateProcess4", async (req, res) => {
    const { index_data, internal_lot } = req.body;

    try {
      // duplicate data
      await queryDatabase(
        `INSERT INTO data (
           internal_lot, p3, p4, p5, p6, p7, p8, status, edit
         )
         SELECT
           internal_lot, p3, p4, p5, p6, p7, p8, status, 1
         FROM data
         WHERE index_data = ?`,
        [index_data]
      );

      // update old index_data with reset p4-p8 = 0
      await queryDatabase(
        `UPDATE data
         SET edit = 0, p4 = 0, p5 = 0, p6 = 0, p7 = 0, p8 = 0
         WHERE index_data = ?`,
        [index_data]
      );

      // update internal_lot.process = 4
      await queryDatabase(
        `UPDATE internal_lot SET process = 3 WHERE index_lot = ?`,
        [internal_lot]
      );

      res.json({
        success: true,
        message: "Process4 ready to updated",
      });
    } catch (err) {
      console.error("updateProcess4 Error:", err);
      res
        .status(500)
        .json({ error: "Failed updateProcess4", details: err.message });
    }
  });

  // **
  router.post("/updateProcess5", async (req, res) => {
    const {
      index_data,
      emp_id,
      date_p5,
      start,
      finish,
      total,
      internal_lot,
      urgent,
    } = req.body;

    try {
      // 1) Insert new process5
      const insertResult = await queryDatabase(
        `INSERT INTO process5 (emp_id, date_p5, start, finish, total)
         VALUES (?, ?, ?, ?, ?)`,
        [emp_id, date_p5, start, finish, total]
      );
      const newIndexP5 = insertResult.insertId;

      // 2) find index_p5
      const oldData = await queryDatabase(
        `SELECT p5 FROM data WHERE index_data = ?`,
        [index_data]
      );
      const oldIndexP5 = oldData[0].p5;

      // 3) update data all p5 = index_p5  → edit = 1
      await queryDatabase(`UPDATE data SET edit = 1 WHERE p5 = ?`, [
        oldIndexP5,
      ]);

      // 4) duplicate data
      await queryDatabase(
        `INSERT INTO data (
           internal_lot, p3, p4, p5, p6, p7, p8, status, edit
         )
         SELECT
           internal_lot, p3, p4, p5, p6, p7, p8, status, 1
         FROM data
         WHERE index_data = ?`,
        [index_data]
      );

      // 5) update old index_data with new p5 reset p6-p8 = 0
      await queryDatabase(
        `UPDATE data
         SET p5 = ?, edit = 0, p6 = 0, p7 = 0, p8 = 0
         WHERE index_data = ?`,
        [newIndexP5, index_data]
      );

      // 6) update internal_lot.process = 5
      await queryDatabase(
        `UPDATE internal_lot SET process = 5 , urgent = ? WHERE index_lot = ?`,
        [urgent, internal_lot]
      );

      res.json({
        success: true,
        message: "Process5 new updated",
      });
    } catch (err) {
      console.error("updateProcess5 Error:", err);
      res
        .status(500)
        .json({ error: "Failed updateProcess5", details: err.message });
    }
  });

  // **
  router.post("/updateProcess6", async (req, res) => {
    const { index_data, internal_lot } = req.body;

    try {
      await queryDatabase(
        `UPDATE data
         SET edit = 1
         WHERE internal_lot = ?`,
        [internal_lot]
      );

      // Duplicate the current data row as backup (edit=1)
      await queryDatabase(
        `INSERT INTO data (
           internal_lot, p3, p4, p5, p6, p7, p8, status, edit
         )
         SELECT
           internal_lot, p3, p4, p5, p6, p7, p8, status, 1
         FROM data
         WHERE index_data = ?`,
        [index_data]
      );

      // Update the target data row with the new process6 id
      await queryDatabase(
        `UPDATE data
         SET p6 = 0, p7 = 0, p8 = 0, edit = 0
         WHERE index_data = ?`,
        [index_data]
      );

      await queryDatabase(
        `UPDATE internal_lot SET process = 5 WHERE index_lot = ?`,
        [internal_lot]
      );

      res.json({
        success: true,
        message: "Process6 ready to updated",
      });
    } catch (err) {
      console.error("updateProcess6 Error:", err);
      res
        .status(500)
        .json({ error: "Failed updateProcess6", details: err.message });
    }
  });

  router.post("/internalLotForProcess7", async (req, res) => {
    const { invoice } = req.body;
    try {
      const result = await queryDatabase(
        `SELECT index_lot, batch, urgent
        FROM
	    internal_lot 
        WHERE process = 6 AND invoice = ?`,
        [invoice]
      );

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch internal lot" });
    }
  });

  router.post("/addProcess7", async (req, res) => {
    const {
      invoice,
      emp_id,
      date_p7,
      start,
      finish,
      total,
      internal_lot,
      require_date,
      all_lot,
    } = req.body;

    try {
      // 1. Insert into process7
      const result = await queryDatabase(
        `INSERT INTO process7 (emp_id, date_p7, start, finish, total, require_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [emp_id, date_p7, start, finish, total, require_date]
      );
      const index_p7 = result.insertId;

      if (internal_lot.length > 0) {
        if (all_lot === false) {
          // Partial lots → urgent = 1
          await queryDatabase(
            `UPDATE internal_lot
             SET urgent = 1, process = 7
             WHERE process = 6 AND invoice = ? AND index_lot IN (?)`,
            [invoice, internal_lot]
          );

          // Invoice becomes urgent
          await queryDatabase(
            `UPDATE invoice SET status = 'urgent' WHERE code = ?`,
            [invoice]
          );
        } else {
          // All lots → urgent stays 1 if already 1, else set to 0
          await queryDatabase(
            `UPDATE internal_lot
             SET urgent = CASE 
                            WHEN urgent = 1 THEN 1
                            ELSE 0
                          END,
                 process = 7
             WHERE process = 6 AND invoice = ? AND index_lot IN (?)`,
            [invoice, internal_lot]
          );

          // Invoice back to none
          await queryDatabase(
            `UPDATE invoice SET status = 'none' WHERE code = ?`,
            [invoice]
          );
        }

        // Update data for selected lots
        await queryDatabase(
          `UPDATE data 
           SET p7 = ?
           WHERE internal_lot IN (?)`,
          [index_p7, internal_lot]
        );
      }

      res.json({ success: true, message: "Process7 completed" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed addProcess7" });
    }
  });

  router.post("/internalLotForProcess8", async (req, res) => {
    const { invoice } = req.body;
    try {
      const result = await queryDatabase(
        `SELECT
            index_lot,
            internal_lot.batch,
            DATE_FORMAT(process1.incoming_date, '%d-%b-%Y') AS incoming_date,
            urgent
        FROM internal_lot
        INNER JOIN invoice 
            ON invoice.code = internal_lot.invoice
        INNER JOIN process1 
            ON process1.index_p1 = invoice.p1
        WHERE internal_lot.process = 7 AND invoice.code = ?`,
        [invoice]
      );

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch internal lot" });
    }
  });

  router.post("/addProcess8", async (req, res) => {
    const {
      invoice,
      emp_id,
      date_p8,
      start,
      finish,
      total,
      internal_lot,
      exp_date,
      location,
    } = req.body;

    try {
      // Insert into process8
      const result = await queryDatabase(
        `INSERT INTO process8 (emp_id, date_p8, start, finish, total, exp_date, location)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [emp_id, date_p8, start, finish, total, exp_date, location]
      );
      const index_p8 = result.insertId;

      // Update internal_lot & data
      if (internal_lot.length > 0) {
        await queryDatabase(
          `UPDATE internal_lot
           SET process = 8
           WHERE process = 7 AND invoice = ? AND index_lot IN (?)`,
          [invoice, internal_lot]
        );

        await queryDatabase(
          `UPDATE data 
           SET p8 = ?, status = 1
           WHERE internal_lot IN (?)`,
          [index_p8, internal_lot]
        );
      }

      // Check if all data rows for this invoice are completed
      const rows = await queryDatabase(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) AS completed
         FROM data
         JOIN internal_lot ON data.internal_lot = internal_lot.index_lot
         WHERE internal_lot.invoice = ?`,
        [invoice]
      );

      if (
        rows.length > 0 &&
        rows[0].total > 0 &&
        rows[0].total === rows[0].completed
      ) {
        // All rows are completed → update invoice
        await queryDatabase(
          `UPDATE invoice 
           SET finish_status = 1, status = 'none'
           WHERE code = ?`,
          [invoice]
        );
      }

      res.json({ success: true, message: "Process8 completed" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed addProcess8" });
    }
  });

  // Get Internal Lot by Invoice
  router.post("/internalLotWithInvoice", async (req, res) => {
    const { invoice } = req.body;
    try {
      const result = await queryDatabase(
        `SELECT
                index_lot,
                batch,
                invoice,
                material_code,
                internal_lot.item_code,
                external_lot,
                quantity,
                unit,
                reference,
                storage_location,
                process + 1 AS process,
                urgent,
                CASE 
                WHEN internal_lot.process < 6 
                  THEN DATEDIFF(CURDATE(), process1.incoming_date)
                  ELSE 0
                END AS delay,
                CASE 
                WHEN remark IS NULL OR remark = ''
                  THEN '-'
                  ELSE remark
                END AS remark 
             FROM internal_lot
             INNER JOIN invoice ON invoice.code = internal_lot.invoice
             LEFT JOIN process1 ON process1.index_p1 = invoice.p1
             WHERE invoice = ? AND process < 8 AND process != 0
             ORDER BY process1.incoming_date`,
        [invoice]
      );

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  // ** Search internal lot config invoice **
  router.post("/internalLotWithInvoiceAndLot", async (req, res) => {
    const { invoice, internal_lot } = req.body;
    try {
      const result = await queryDatabase(
        `SELECT
                index_lot,
                batch,
                invoice,
                material_code,
                internal_lot.item_code,
                external_lot,
                quantity,
                unit,
                reference,
                storage_location,
                process + 1 AS process,
                urgent,
                CASE 
                WHEN internal_lot.process < 6 
                  THEN DATEDIFF(CURDATE(), process1.incoming_date)
                  ELSE 0
                END AS delay,
                CASE 
                WHEN remark IS NULL OR remark = ''
                  THEN '-'
                  ELSE remark
                END AS remark 
             FROM internal_lot
             INNER JOIN invoice ON invoice.code = internal_lot.invoice
             LEFT JOIN process1 ON process1.index_p1 = invoice.p1
             WHERE invoice = ? AND batch LIKE ? AND process < 8 AND process != 0`,
        [invoice, `%${internal_lot}%`]
      );

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  // Get All Internal Lot
  router.get("/getInternalLot", async (req, res) => {
    try {
      const result = await queryDatabase(
        `SELECT
            index_lot,
                batch,
                invoice,
                material_code,
                internal_lot.item_code,
                external_lot,
                quantity,
                unit,
                reference,
                storage_location,
                process + 1 AS 'process',
                urgent,
                CASE 
                WHEN internal_lot.process < 6 
                  THEN DATEDIFF(CURDATE(), process1.incoming_date)
                  ELSE 0
                END AS delay,
                CASE 
                WHEN remark IS NULL OR remark = ''
                  THEN '-'
                  ELSE remark
                END AS remark 
            FROM
                internal_lot
            INNER JOIN invoice ON invoice.code = internal_lot.invoice
            LEFT JOIN process1 ON process1.index_p1 = invoice.p1
            WHERE process < 8 AND process != 0
            ORDER BY process1.incoming_date`
      );

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch internal lot" });
    }
  });

  // ** Search only internal lot**
  router.post("/searchInternalLot", async (req, res) => {
    const { internal_lot } = req.body;
    try {
      const result = await queryDatabase(
        `
        SELECT
            index_lot,
            batch,
            invoice,
            material_code,
            internal_lot.item_code,
            external_lot,
            quantity,
            unit,
            reference,
            storage_location,
            process + 1 AS process,
            urgent,
            CASE 
              WHEN internal_lot.process < 6 
                THEN DATEDIFF(CURDATE(), process1.incoming_date)
                ELSE 0
            END AS delay,
            CASE 
              WHEN remark IS NULL OR remark = '' THEN '-'
              ELSE remark
            END AS remark
        FROM internal_lot
        INNER JOIN invoice ON invoice.code = internal_lot.invoice
        LEFT JOIN process1 ON process1.index_p1 = invoice.p1
        WHERE batch LIKE ? AND process < 8 AND process != 0
        `,
        [`%${internal_lot}%`]
      );

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  // Filter Internal Lot by Invoice and Date
  router.post("/internalLotWithInvoiceByDate", async (req, res) => {
    const { invoice, start, end } = req.body;

    if (!invoice || !start || !end) {
      return res
        .status(400)
        .json({ error: "Invoice, start, and end dates are required" });
    }

    try {
      const result = await queryDatabase(
        `SELECT
            index_lot,
            batch,
            invoice,
            material_code,
            internal_lot.item_code,
            external_lot,
            quantity,
            unit,
            reference,
            storage_location,
            process + 1 AS process,
            urgent,
            CASE 
              WHEN internal_lot.process < 6 
                THEN DATEDIFF(CURDATE(), process1.incoming_date)
                ELSE 0
            END AS delay,
            CASE 
              WHEN remark IS NULL OR remark = ''
                THEN '-'
                ELSE remark
            END AS remark 
         FROM internal_lot
         INNER JOIN invoice ON invoice.code = internal_lot.invoice
         LEFT JOIN process1 ON process1.index_p1 = invoice.p1
         WHERE invoice = ?
           AND process < 8
           AND process != 0
           AND process1.incoming_date BETWEEN ? AND ?
           ORDER BY process1.incoming_date`,
        [invoice, start, end]
      );

      res.json(result);
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: "Failed to fetch internal lot with invoice" });
    }
  });

  // Filter All Internal Lot by Date
  router.post("/getInternalLotByDate", async (req, res) => {
    const { start, end } = req.body;

    if (!start || !end) {
      return res
        .status(400)
        .json({ error: "Start and end dates are required" });
    }

    try {
      const result = await queryDatabase(
        `SELECT
            index_lot,
            batch,
            invoice,
            material_code,
            internal_lot.item_code,
            external_lot,
            quantity,
            unit,
            reference,
            storage_location,
            process + 1 AS process,
            urgent,
            CASE 
              WHEN internal_lot.process < 6 
                THEN DATEDIFF(CURDATE(), process1.incoming_date)
                ELSE 0
            END AS delay,
            CASE 
              WHEN remark IS NULL OR remark = ''
                THEN '-'
                ELSE remark
            END AS remark 
            FROM internal_lot
            INNER JOIN invoice ON invoice.code = internal_lot.invoice
            LEFT JOIN process1 ON process1.index_p1 = invoice.p1
            WHERE process < 8
              AND process != 0
              AND process1.incoming_date BETWEEN ? AND ?
            ORDER BY process1.incoming_date`,
        [start, end]
      );

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch internal lot" });
    }
  });

  // ** Edit Internal Lot
  router.post("/editInternalLot/:index_lot", async (req, res) => {
    const { index_lot } = req.params;
    const {
      batch,
      material,
      item_code,
      external_lot,
      quantity,
      unit,
      urgent,
      remark,
    } = req.body;

    try {
      const result = await queryDatabase(
        `UPDATE internal_lot
         SET batch = ? , material_code = ? , item_code = ? , external_lot = ? , quantity = ? , unit = ? , remark = ? , urgent = ?
         WHERE index_lot = ?`,
        [
          batch,
          material,
          item_code,
          external_lot,
          quantity,
          unit,
          remark,
          urgent,
          index_lot,
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Internal lot not found" });
      }

      res.json({ message: "Internal lot updated successfully" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        error: "Internal server error",
        errno: err.errno,
        details: err.sqlMessage,
      });
    }
  });

  // Delete Internal Lot
  router.delete("/deleteInternalLot/:index_lot", async (req, res) => {
    const { index_lot } = req.params;

    try {
      let query;
      let values;

      query = "UPDATE internal_lot SET process = 0 WHERE index_lot = ?";
      values = [index_lot];

      await queryDatabase(query, values);
      res.json({ message: "Internal lot has been deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: "Database query error", details: err });
    }
  });

  app.use(router);
  return router;
};
