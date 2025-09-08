const express = require("express");
const moment = require("moment");
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

module.exports = (app, connection) => {
  const router = express.Router();

  router.post("/export-invoice", async (req, res) => {
    const { invoice } = req.body;

    try {
      const sql = `
        SELECT
          COALESCE(DATE_FORMAT(process1.incoming_date, '%Y-%m-%d'), '-') AS Incoming_date,
          COALESCE(DATE_FORMAT(process1.incoming_date, '%d-%b-%Y'), '-') AS Incoming_date_display,
          COALESCE(l8.name, '-') AS location,
          invoice.code AS invoice,
          section.name AS section,
          sb.code AS str_before,
          sa.code AS str_after,
          internal_lot.storage_location AS wh_storage,
          internal_lot.item_code AS material_description,
          internal_lot.external_lot AS external_lot,
          internal_lot.material_code AS material,
          internal_lot.batch AS internal_lot,
          internal_lot.quantity AS quantity,
          internal_lot.unit AS unit,

          -- Process 1
          COALESCE(e1.emp_name, '-') AS process1_name,
          COALESCE(DATE_FORMAT(process1.date_p1, '%d-%b-%Y'), '-') AS process1_date,
          COALESCE(process1.start, '-') AS process1_start,
          COALESCE(process1.finish, '-') AS process1_finish,
          COALESCE(process1.total, '-') AS process1_total,

          -- Process 2
          COALESCE(e2.emp_name, '-') AS process2_name,
          COALESCE(DATE_FORMAT(process2.date_p2, '%d-%b-%Y'), '-') AS process2_date,
          COALESCE(process2.start, '-') AS process2_start,
          COALESCE(process2.finish, '-') AS process2_finish,
          COALESCE(process2.total, '-') AS process2_total,

          -- Process 3
          COALESCE(e3.emp_name, '-') AS process3_name,
          COALESCE(DATE_FORMAT(process3.date_p3, '%d-%b-%Y'), '-') AS process3_date,
          COALESCE(process3.start, '-') AS process3_start,
          COALESCE(process3.finish, '-') AS process3_finish,
          COALESCE(process3.total, '-') AS process3_total,

          -- Process 4
          COALESCE(e4.emp_name, '-') AS process4_name,
          COALESCE(DATE_FORMAT(process4.date_p4, '%d-%b-%Y'), '-') AS process4_date,
          COALESCE(process4.start, '-') AS process4_start,
          COALESCE(process4.finish, '-') AS process4_finish,
          COALESCE(process4.total, '-') AS process4_total,

          -- Process 5
          COALESCE(e5.emp_name, '-') AS process5_name,
          COALESCE(DATE_FORMAT(process5.date_p5, '%d-%b-%Y'), '-') AS process5_date,
          COALESCE(process5.start, '-') AS process5_start,
          COALESCE(process5.finish, '-') AS process5_finish,
          COALESCE(process5.total, '-') AS process5_total,

          -- Process 6
          COALESCE(e6.emp_name, '-') AS process6_name,
          COALESCE(DATE_FORMAT(process6.tag_date, '%d-%b-%Y'), '-') AS process6_date,
          COALESCE(process6.tag_start, '-') AS process6_start,
          COALESCE(process6.tag_finish, '-') AS process6_finish,
          COALESCE(process6.total, '-') AS process6_total,
          COALESCE(c6.emp_name, '-') AS process6_confirmBy,
          COALESCE(process6.judgement, '-') AS process6_judgement,
          COALESCE(l6.name, '-') AS process6_location,

          -- Process 7
          COALESCE(e7.emp_name, '-') AS process7_name,
          COALESCE(DATE_FORMAT(process7.date_p7, '%d-%b-%Y'), '-') AS process7_date,
          COALESCE(process7.start, '-') AS process7_start,
          COALESCE(process7.finish, '-') AS process7_finish,
          COALESCE(process7.total, '-') AS process7_total,
          COALESCE(DATE_FORMAT(process7.require_date, '%d-%b-%Y'), '-') AS process7_requireDate,

          -- Process 8
          COALESCE(e8.emp_name, '-') AS process8_name,
          COALESCE(DATE_FORMAT(process8.date_p8, '%d-%b-%Y'), '-') AS process8_date,
          COALESCE(process8.start, '-') AS process8_start,
          COALESCE(process8.finish, '-') AS process8_finish,
          COALESCE(process8.total, '-') AS process8_total,
          COALESCE(DATE_FORMAT(process8.exp_date, '%d-%b-%Y'), '-') AS process8_expDate,
          COALESCE(l8.name, '-') AS process8_location

        FROM data
        JOIN internal_lot ON data.internal_lot = internal_lot.index_lot
        INNER JOIN invoice ON internal_lot.invoice = invoice.code
        INNER JOIN section ON invoice.section = section.index_section
        LEFT JOIN storage_location sb ON invoice.str_before = sb.index_storage
        LEFT JOIN storage_location sa ON invoice.str_after = sa.index_storage

        LEFT JOIN process1 ON invoice.p1 = process1.index_p1
        LEFT JOIN employee e1 ON process1.emp_id = e1.emp_id

        LEFT JOIN process2 ON invoice.p2 = process2.index_p2
        LEFT JOIN employee e2 ON process2.emp_id = e2.emp_id

        LEFT JOIN process3 ON data.p3 = process3.index_p3
        LEFT JOIN employee e3 ON process3.emp_id = e3.emp_id

        LEFT JOIN process4 ON data.p4 = process4.index_p4
        LEFT JOIN employee e4 ON process4.emp_id = e4.emp_id

        LEFT JOIN process5 ON data.p5 = process5.index_p5
        LEFT JOIN employee e5 ON process5.emp_id = e5.emp_id

        LEFT JOIN process6 ON data.p6 = process6.index_p6
        LEFT JOIN employee e6 ON process6.emp_id = e6.emp_id
        LEFT JOIN employee c6 ON process6.confirm_by = c6.emp_id
        LEFT JOIN location l6 ON process6.location = l6.index_location

        LEFT JOIN process7 ON data.p7 = process7.index_p7
        LEFT JOIN employee e7 ON process7.emp_id = e7.emp_id

        LEFT JOIN process8 ON data.p8 = process8.index_p8
        LEFT JOIN employee e8 ON process8.emp_id = e8.emp_id
        LEFT JOIN location l8 ON process8.location = l8.index_location

        WHERE invoice.code = ? AND internal_lot.process != 0
        ORDER BY 
          internal_lot.index_lot ASC,
          CASE 
            WHEN process6.judgement = 'NG' THEN 0
            WHEN process6.judgement = 'OK' THEN 1
            ELSE 2
          END ASC
      `;

      connection.query(sql, [invoice], async (err, results) => {
        if (err)
          return res.status(500).json({ error: "Database query failed" });
        if (results.length === 0)
          return res.status(404).json({ error: "No data found" });

        const basePath = path.join(__dirname, "exportForm");
        const templatePath = path.join(basePath, "exportData.xlsx");

        if (!fs.existsSync(templatePath)) {
          return res.status(404).send("Report template not found");
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(templatePath);
        const worksheet = workbook.getWorksheet("Sheet1");

        // Config mapping (A → BG)
        const columnConfig = [
          { key: "Incoming_date_display", col: "A" },
          { key: "location", col: "B" },
          { key: "invoice", col: "C" },
          { key: "section", col: "D" },
          { key: "str_before", col: "E" },
          { key: "str_after", col: "F" },
          { key: "wh_storage", col: "G" },
          { key: "material_description", col: "H" },
          { key: "external_lot", col: "I" },
          { key: "material", col: "J" },
          { key: "internal_lot", col: "K" },
          { key: "quantity", col: "L" },
          { key: "unit", col: "M" },

          // Process 1
          { key: "process1_name", col: "N" },
          { key: "process1_date", col: "O" },
          { key: "process1_start", col: "P" },
          { key: "process1_finish", col: "Q" },
          { key: "process1_total", col: "R" },

          // Process 2
          { key: "process2_name", col: "S" },
          { key: "process2_date", col: "T" },
          { key: "process2_start", col: "U" },
          { key: "process2_finish", col: "V" },
          { key: "process2_total", col: "W" },

          // Process 3
          { key: "process3_name", col: "X" },
          { key: "process3_date", col: "Y" },
          { key: "process3_start", col: "Z" },
          { key: "process3_finish", col: "AA" },
          { key: "process3_total", col: "AB" },

          // Process 4
          { key: "process4_name", col: "AC" },
          { key: "process4_date", col: "AD" },
          { key: "process4_start", col: "AE" },
          { key: "process4_finish", col: "AF" },
          { key: "process4_total", col: "AG" },

          // Process 5
          { key: "process5_name", col: "AH" },
          { key: "process5_date", col: "AI" },
          { key: "process5_start", col: "AJ" },
          { key: "process5_finish", col: "AK" },
          { key: "process5_total", col: "AL" },

          // Process 6
          { key: "process6_name", col: "AM" },
          { key: "process6_date", col: "AN" },
          { key: "process6_start", col: "AO" },
          { key: "process6_finish", col: "AP" },
          { key: "process6_total", col: "AQ" },
          { key: "process6_confirmBy", col: "AR" },
          { key: "process6_judgement", col: "AS" },
          { key: "process6_location", col: "AT" },

          // Process 7
          { key: "process7_name", col: "AU" },
          { key: "process7_date", col: "AV" },
          { key: "process7_start", col: "AW" },
          { key: "process7_finish", col: "AX" },
          { key: "process7_total", col: "AY" },
          { key: "process7_requireDate", col: "AZ" },

          // Process 8
          { key: "process8_name", col: "BA" },
          { key: "process8_date", col: "BB" },
          { key: "process8_start", col: "BC" },
          { key: "process8_finish", col: "BD" },
          { key: "process8_total", col: "BE" },
          { key: "process8_expDate", col: "BF" },
          { key: "process8_location", col: "BG" },
        ];

        //  Write data starting from row 3
        const startRow = 3;
        results.forEach((rowData, i) => {
          const rowNumber = startRow + i;
          const row = worksheet.getRow(rowNumber);

          columnConfig.forEach((map) => {
            let value = rowData[map.key] || "-";

            // 1. Handle location fallback
            if (map.key === "location") {
              value =
                rowData.process8_location &&
                rowData.process8_location.trim() !== "-"
                  ? rowData.process8_location
                  : rowData.process6_location || "-";
            }

            row.getCell(map.col).value = value;
          });

          // 2. Highlight rows if judgement missing
          const judgement = rowData.process6_judgement;
          const incomingDateStr = rowData.Incoming_date;

          if (!judgement || judgement.trim() === "" || judgement === "-") {
            if (incomingDateStr && incomingDateStr !== "-") {
              // parse safely (YYYY-MM-DD → local date)
              const [y, m, d] = incomingDateStr.split("-");
              const incomingDate = new Date(
                Number(y),
                Number(m) - 1,
                Number(d)
              );

              const today = new Date();
              const diffDays = Math.floor(
                (today - incomingDate) / (1000 * 60 * 60 * 24)
              );

              if (diffDays > 7) {
                row.eachCell((cell) => {
                  cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FF5050" }, // 🔴 Red
                  };
                });
              } else if (diffDays > 5) {
                row.eachCell((cell) => {
                  cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FFFF00" }, // 🟡 Yellow
                  };
                });
              }
            }
          }

          row.commit();
        });

        worksheet.columns.forEach((column) => {
          let maxLength = 10;
          column.eachCell({ includeEmpty: false }, (cell) => {
            const value = cell.value ? cell.value.toString() : "";
            maxLength = Math.max(maxLength, value.length);
          });
          column.width = Math.min(maxLength + 2, 20);
        });

        const filename = `dataInvoice_(${invoice}).xlsx`;
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        await workbook.xlsx.write(res);
        res.end();
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.use(router);
  return router;
};
