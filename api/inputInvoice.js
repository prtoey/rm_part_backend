const express = require("express");

module.exports = (app, connection) => {
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

  router.post("/addInvoice", async (req, res) => {
    const { invoice, emp_id, section, str_before, str_after } = req.body;

    try {
      await queryDatabase(
        `INSERT INTO invoice 
         (code, emp_id, section, str_before, str_after, 
          material_status, p1, p2, finish_status, status) 
         VALUES (?, ?, ?, ?, ?, 'none', 0, 0, 0, 'none')`,
        [invoice, emp_id, section, str_before, str_after]
      );

      res.json({ message: "Invoice added successfully" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        error: "Internal server error",
        errno: err.errno,
        details: err.sqlMessage,
      });
    }
  });

  router.get("/getInvoice", async (req, res) => {
    try {
      const rows = await queryDatabase(
        `
        SELECT 
            i.code AS invoice_code,
            employee.emp_name,
            i.section,
            section.name AS section_name, 
            str_before,
            str_after,
            i.status,
            i.p1,
            i.p2,
            DATE_FORMAT(p1.incoming_date, '%d-%b-%Y') AS incoming_date,
            CASE 
                WHEN p1.incoming_date IS NOT NULL 
                THEN DATEDIFF(NOW(), p1.incoming_date)
                ELSE 0 
            END AS delay,
            i.material_status,
            sb.code AS str_before_code,
            sa.code AS str_after_code
        FROM invoice i
        LEFT JOIN process1 p1 ON i.p1 = p1.index_p1
        INNER JOIN section ON i.section = section.index_section
        INNER JOIN employee ON i.emp_id = employee.emp_id
        LEFT JOIN storage_location sb ON i.str_before = sb.index_storage
        LEFT JOIN storage_location sa ON i.str_after = sa.index_storage
        WHERE i.status != 'cancel' AND i.finish_status = 0
        ORDER BY p1.incoming_date
        `
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  router.post("/editInvoice/:code", async (req, res) => {
    const { code } = req.params;
    const { invoice, emp_id, section, str_before, str_after } = req.body;

    try {
      const result = await queryDatabase(
        `UPDATE invoice
         SET code = ?,
             emp_id = ?, 
             section = ?, 
             str_before = ?, 
             str_after = ?, 
         WHERE code = ?`,
        [invoice, emp_id, section, str_before, str_after, code]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      res.json({ message: "Invoice updated successfully" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({
        error: "Internal server error",
        errno: err.errno,
        details: err.sqlMessage,
      });
    }
  });

  router.delete("/delete/invoice/:code", async (req, res) => {
    const { code } = req.params;

    try {
      let query;
      let values;

      query = "UPDATE invoice SET status = 'cancel' WHERE code = ?";
      values = [code];

      await queryDatabase(query, values);
      res.json({ message: "Invoice has been deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: "Database query error", details: err });
    }
  });

  router.get("/historyInvoice", async (req, res) => {
    try {
      const rows = await queryDatabase(
        `
        SELECT 
            i.code AS invoice_code,
            employee.emp_name,
            i.section,
            s.name AS section_name, 
            sb.code AS str_before,
            sa.code AS str_after,
            i.status,
            DATE_FORMAT(p1.incoming_date, '%d-%b-%Y') AS incoming_date,
            CASE
                WHEN i.finish_status = 1 THEN 'Completed'
                ELSE 'Not Completed' 
            END AS finish_status,
            CASE
                WHEN i.material_status = 'none' THEN 0
                ELSE 1 
            END AS download
        FROM invoice i
        LEFT JOIN process1 p1 ON i.p1 = p1.index_p1
        INNER JOIN section s ON i.section = s.index_section
        INNER JOIN employee ON i.emp_id = employee.emp_id
        LEFT JOIN storage_location sb ON i.str_before = sb.index_storage
        LEFT JOIN storage_location sa ON i.str_after = sa.index_storage
        WHERE i.status != 'cancel'
        ORDER BY p1.incoming_date
        `
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch invoices", details: err });
    }
  });

  router.post("/filterInvoiceByDate", async (req, res) => {
    const { start, end } = req.body;

    if (!start || !end) {
      return res
        .status(400)
        .json({ error: "Start and end dates are required" });
    }

    try {
      const rows = await queryDatabase(
        `
        SELECT 
            i.code AS invoice_code,
            i.section,
            employee.emp_name,
            section.name AS section_name, 
            str_before,
            str_after,
            i.status,
            i.p1,
            i.p2,
            DATE_FORMAT(p1.incoming_date, '%d-%b-%Y') AS incoming_date,
            CASE 
                WHEN p1.incoming_date IS NOT NULL 
                THEN DATEDIFF(NOW(), p1.incoming_date)
                ELSE 0 
            END AS delay,
            i.material_status,
            sb.code AS str_before_code,
            sa.code AS str_after_code
        FROM invoice i
        LEFT JOIN process1 p1 ON i.p1 = p1.index_p1
        INNER JOIN section ON i.section = section.index_section
        INNER JOIN employee ON i.emp_id = employee.emp_id
        LEFT JOIN storage_location sb ON i.str_before = sb.index_storage
        LEFT JOIN storage_location sa ON i.str_after = sa.index_storage
        WHERE i.status != 'cancel'
          AND i.finish_status = 0
          AND p1.incoming_date BETWEEN ? AND ?
        ORDER BY p1.incoming_date
        `,
        [start, end]
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  // ** Filter invoice by code
  router.post("/filterInvoiceByCode", async (req, res) => {
    const { code } = req.body;

    try {
      const rows = await queryDatabase(
        `
        SELECT 
            i.code AS invoice_code,
            i.section,
            employee.emp_name,
            section.name AS section_name, 
            str_before,
            str_after,
            i.status,
            i.p1,
            i.p2,
            DATE_FORMAT(p1.incoming_date, '%d-%b-%Y') AS incoming_date,
            CASE 
                WHEN p1.incoming_date IS NOT NULL 
                THEN DATEDIFF(NOW(), p1.incoming_date)
                ELSE 0 
            END AS delay,
            i.material_status,
            sb.code AS str_before_code,
            sa.code AS str_after_code
        FROM invoice i
        LEFT JOIN process1 p1 ON i.p1 = p1.index_p1
        INNER JOIN section ON i.section = section.index_section
        INNER JOIN employee ON i.emp_id = employee.emp_id
        LEFT JOIN storage_location sb ON i.str_before = sb.index_storage
        LEFT JOIN storage_location sa ON i.str_after = sa.index_storage
        WHERE i.status != 'cancel'
          AND i.finish_status = 0
          AND i.code LIKE ?
        ORDER BY p1.incoming_date
        `,
        [`%${code}%`]
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  // **
  router.post("/filterHistoryInvoiceByDate", async (req, res) => {
    const { start, end } = req.body;

    if (!start || !end) {
      return res
        .status(400)
        .json({ error: "Start and end dates are required" });
    }

    try {
      const rows = await queryDatabase(
        `
        SELECT 
            i.code AS invoice_code,
            i.section,
            employee.emp_name,
            s.name AS section_name, 
            sb.code AS str_before,
            sa.code AS str_after,
            i.status,
            DATE_FORMAT(p1.incoming_date, '%d-%b-%Y') AS incoming_date,
            CASE
                WHEN i.finish_status = 1 THEN 'Completed'
                ELSE 'Not Completed' 
            END AS finish_status,
            CASE
                WHEN i.material_status = 'none' THEN 0
                ELSE 1 
            END AS download
        FROM invoice i
        LEFT JOIN process1 p1 ON i.p1 = p1.index_p1
        INNER JOIN section s ON i.section = s.index_section
        INNER JOIN employee ON i.emp_id = employee.emp_id
        LEFT JOIN storage_location sb ON i.str_before = sb.index_storage
        LEFT JOIN storage_location sa ON i.str_after = sa.index_storage
        WHERE i.status != 'cancel'
          AND p1.incoming_date BETWEEN ? AND ?
        ORDER BY p1.incoming_date
        `,
        [start, end]
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch history invoices" });
    }
  });

  // ** Search invoice in history by code
  router.post("/filterHistoryInvoiceByCode", async (req, res) => {
    const { code } = req.body;

    try {
      const rows = await queryDatabase(
        `
        SELECT 
            i.code AS invoice_code,
            i.section,
            employee.emp_name,
            s.name AS section_name, 
            sb.code AS str_before,
            sa.code AS str_after,
            i.status,
            DATE_FORMAT(p1.incoming_date, '%d-%b-%Y') AS incoming_date,
            CASE
                WHEN i.finish_status = 1 THEN 'Completed'
                ELSE 'Not Completed' 
            END AS finish_status,
            CASE
                WHEN i.material_status = 'none' THEN 0
                ELSE 1 
            END AS download
        FROM invoice i
        LEFT JOIN process1 p1 ON i.p1 = p1.index_p1
        INNER JOIN section s ON i.section = s.index_section
        INNER JOIN employee ON i.emp_id = employee.emp_id
        LEFT JOIN storage_location sb ON i.str_before = sb.index_storage
        LEFT JOIN storage_location sa ON i.str_after = sa.index_storage
        WHERE i.status != 'cancel'
          AND i.code LIKE ?
        ORDER BY p1.incoming_date
        `,
        [`%${code}%`]
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch history invoices" });
    }
  });

  app.use(router);
  return router;
};
