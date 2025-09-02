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
    const {
      invoice,
      emp_id,
      section,
      str_before,
      str_after,
      material,
      item_code,
    } = req.body;

    try {
      await queryDatabase(
        `INSERT INTO invoice 
         (code, emp_id, section, str_before, str_after, material, item_code, 
          material_status, p1, p2, finish_status, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'none')`,
        [invoice, emp_id, section, str_before, str_after, material, item_code]
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
        SELECT i.*, 
               CASE 
                 WHEN p1.incoming_date IS NOT NULL 
                      AND DATEDIFF(NOW(), p1.incoming_date) > 14 
                 THEN 1 ELSE 0 
               END AS delay
        FROM invoice i
        LEFT JOIN process1 p1 ON i.p1 = p1.index_p1
        ORDER BY i.code DESC
        `
      );

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  app.use(router);
  return router;
};
