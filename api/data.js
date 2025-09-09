const express = require("express");

module.exports = (app, connection) => {
  const router = express.Router();
  app.use(express.json());

  function queryDatabase(query, values) {
    return new Promise((resolve, reject) => {
      connection.query(query, values, (err, results) => {
        if (err) {
          console.log(err);
          reject(err);
        } else resolve(results);
      });
    });
  }

  // Check Admin
  router.post("/checkAdmin", async (req, res) => {
    const { emp_id, password } = req.body;

    if (!emp_id || !password) {
      return res
        .status(400)
        .json({ check: false, message: "Missing emp_id or password" });
    }

    try {
      const results = await queryDatabase(
        "SELECT emp_id, password FROM employee WHERE emp_id = ? AND admin = 1 AND status = 1",
        [emp_id]
      );

      if (results.length === 0) {
        return res
          .status(401)
          .json({ check: false, message: "Employee not found or Not Admin" });
      }

      const employee = results[0];

      if (employee.password === password) {
        return res.json({ check: true });
      } else {
        return res
          .status(401)
          .json({ check: false, message: "Invalid password" });
      }
    } catch (err) {
      return res.status(500).json({ check: false, message: "Database error" });
    }
  });

  // Check Employee
  router.post("/checkEmployeeID", async (req, res) => {
    const { emp_id } = req.body;

    try {
      const results = await queryDatabase(
        "SELECT emp_id FROM employee WHERE emp_id = ? AND status = 1",
        [emp_id]
      );

      if (results.length === 0) {
        return res
          .status(401)
          .json({ check: false, message: "Employee not found" });
      }

      return res.json({ check: true });
    } catch (err) {
      return res
        .status(500)
        .json({ check: false, message: "Database error", error: err.message });
    }
  });

  // Check Password
  router.post("/checkOldPassword", async (req, res) => {
    const { emp_id, password } = req.body;

    try {
      const results = await queryDatabase(
        "SELECT emp_id, password FROM employee WHERE emp_id = ? AND status = 1",
        [emp_id]
      );

      const employee = results[0];

      if (employee.password === password) {
        return res.json({ check: true });
      } else {
        return res
          .status(401)
          .json({ check: false, message: "Invalid password" });
      }
    } catch (err) {
      return res.status(500).json({ check: false, message: "Database error" });
    }
  });

  // Show data
  router.get("/get/:select", async (req, res) => {
    const { select } = req.params;

    let query;
    switch (select) {
      case "employee":
        query = "SELECT * FROM employee WHERE status = 1";
        break;
      case "section":
        query = "SELECT * FROM section WHERE status = 1";
        break;
      case "storage_before":
        query = `SELECT
                    storage_location.index_storage,
                    storage_location.code,
                    storage_location.fk_section,
                    section.name AS 'section_name'
                FROM storage_location
                INNER JOIN section ON section.index_section = storage_location.fk_section 
                WHERE storage_location.type = 'before' 
                AND storage_location.status = 1`;
        break;
      case "storage_after":
        query = `SELECT
                    storage_location.index_storage,
                    storage_location.code,
                    storage_location.fk_section,
                    section.name AS 'section_name'
                FROM storage_location
                LEFT JOIN section 
                ON section.index_section = storage_location.fk_section 
                WHERE storage_location.type = 'after' 
                AND storage_location.status = 1`;
        break;
      case "location":
        query = "SELECT * FROM location WHERE status = 1";
        break;
      default:
        return res.status(400).json({ error: "Invalid select specified" });
    }

    try {
      const results = await queryDatabase(query);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: "Database query error", details: err });
    }
  });

  // Get option
  router.get("/option/:select/:section", async (req, res) => {
    const { select, section } = req.params;

    let query, values;
    switch (select) {
      case "storage_before":
        query = `SELECT index_storage, code, fk_section FROM storage_location WHERE type = 'before' AND fk_section = ? AND status = 1`;
        break;
      case "storage_after":
        query = `
          SELECT index_storage, code, fk_section 
          FROM storage_location 
          WHERE type = 'after' 
            AND (fk_section = ? OR fk_section IS NULL)
            AND status = 1
        `;
        break;
      default:
        return res.status(400).json({ error: "Invalid select specified" });
    }

    values = [section];

    try {
      const results = await queryDatabase(query, values);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: "Database query error", details: err });
    }
  });

  // Get material by code
  router.post("/material", async (req, res) => {
    const { code } = req.body;
    const query =
      "SELECT item_code FROM material WHERE code = ? AND status = 1";
    try {
      const results = await queryDatabase(query, [code]);
      res.json(results[0] || {});
    } catch (err) {
      res.status(500).json({ error: "Database query error", details: err });
    }
  });

  // Show data with pagination
// Show data with pagination
  router.get("/limit/:select", async (req, res) => {
    const { select } = req.params;
    // query params ?page=1&limit=20
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
     const level = req.query.level || "";
    const offset = (page - 1) * limit;

    let query, countQuery, params = [], countParams = [];

    switch (select ) {
      case "material":
        query = `
          SELECT *
          FROM material
          WHERE status = 1
          ${search ? "AND (code LIKE ? OR item_code LIKE ?)" : ""}
          LIMIT ? OFFSET ?
        `;
        countQuery = `
          SELECT COUNT(*) AS total
          FROM material
          WHERE status = 1
          ${search ? "AND (code LIKE ? OR item_code LIKE ?)" : ""}
        `;
        if (search) {
          params.push(`%${search}%`, `%${search}%`);
          countParams.push(`%${search}%`, `%${search}%`);
        }
        break;

      case "location":
        query = `
          SELECT *
          FROM location
          WHERE status = 1
          ${search ? "AND name LIKE ?" : ""}
          LIMIT ? OFFSET ?
        `;
        countQuery = `
          SELECT COUNT(*) AS total
          FROM location
          WHERE status = 1
          ${search ? "AND name LIKE ?" : ""}
        `;
        if (search) {
          params.push(`%${search}%`);
          countParams.push(`%${search}%`);
        }
        break;

      case "storage_before":
         query = `
            SELECT
            storage_location.index_storage,
            storage_location.code,
            storage_location.fk_section,
            section.name AS section_name
            FROM storage_location
            INNER JOIN section 
            ON section.index_section = storage_location.fk_section
            WHERE storage_location.type = 'before'
            AND storage_location.status = 1
            ${search ? "AND (storage_location.code LIKE ? OR section.name LIKE ?)" : ""}
            LIMIT ? OFFSET ?
          `;

        countQuery = `
            SELECT COUNT(*) AS total
            FROM storage_location
            INNER JOIN section 
            ON section.index_section = storage_location.fk_section
            WHERE storage_location.type = 'before'
            AND storage_location.status = 1
            ${search ? "AND (storage_location.code LIKE ? OR section.name LIKE ?)" : ""}
          `;

        if (search) {
          params.push(`%${search}%`, `%${search}%`);
          countParams.push(`%${search}%`, `%${search}%`);
          }
           break;

      case "storage_after":
          query = `
            SELECT
            storage_location.index_storage,
            storage_location.code,
            storage_location.fk_section,
            section.name AS section_name
            FROM storage_location
            LEFT JOIN section 
            ON section.index_section = storage_location.fk_section
            WHERE storage_location.type = 'after'
            AND storage_location.status = 1
            ${search ? "AND (storage_location.code LIKE ? OR section.name LIKE ?)" : ""}
            LIMIT ? OFFSET ?
            `;

          countQuery = `
            SELECT COUNT(*) AS total
            FROM storage_location
            LEFT JOIN section 
            ON section.index_section = storage_location.fk_section
            WHERE storage_location.type = 'after'
            AND storage_location.status = 1
            ${search ? "AND (storage_location.code LIKE ? OR section.name LIKE ?)" : ""}
            `;

          if (search) {
            params.push(`%${search}%`, `%${search}%`);
            countParams.push(`%${search}%`, `%${search}%`);
          }
          break;

      case "section":
        query = `
          SELECT *
          FROM section
          WHERE status = 1
          ${search ? "AND name LIKE ?" : ""}
          LIMIT ? OFFSET ?
        `;
        countQuery = `
          SELECT COUNT(*) AS total
          FROM section
          WHERE status = 1
          ${search ? "AND name LIKE ?" : ""}
        `;
        if (search) {
          params.push(`%${search}%`);
          countParams.push(`%${search}%`);
        }
        break;

        case "employee":
        query = `
          SELECT *
          FROM employee
          WHERE status = 1
          ${ search ? "AND (emp_id LIKE ? OR emp_name LIKE ?)" : ""}
          ${ level ? "AND admin LIKE ?" : ""}
          LIMIT ? OFFSET ?
        `;
        countQuery = `
          SELECT COUNT(*) AS total
          FROM employee
          WHERE status = 1
          ${search ? "AND (emp_id LIKE ? OR emp_name LIKE ?)" : ""}
           ${ level ? "AND admin LIKE ?" : ""}
        `;
       if (search) {
            params.push(`%${search}%`, `%${search}%`);
            countParams.push(`%${search}%`, `%${search}%`);
          }
        if (level) {
          params.push(level);
          countParams.push(level);
        } 
        break;
    

      default:
        return res.status(400).json({ error: "Invalid select parameter" });
    }

    try {
      const data = await queryDatabase(query, [...params, limit, offset]);
      const totalResult = await queryDatabase(countQuery , countParams);
      const total = totalResult[0].total ?? 0;

      res.json({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        data,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error", details: err.message });
    }
  });

  // Get invoice by code or date
  router.post("/filter/invoice", async (req, res) => {
    try {
      let { startDate, endDate } = req.body;

      const query = `
  SELECT 
    history.index_login, 
    DATE_FORMAT(history.timestamp, '%e %M %Y , %H:%i') AS timestamp, 
    history.emp_id, 
    employee.emp_name, 
    employee.emp_type
  FROM history
  INNER JOIN employee ON employee.emp_id = history.emp_id
  WHERE DATE(history.timestamp) BETWEEN '${startDate}' AND '${endDate}'
`;

      const results = await executeQuery(query, [startDate, endDate]);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: "Database query error", details: err });
    }
  });

  // Add data
  router.post("/add/:select", async (req, res) => {
    const { select } = req.params;
    const { code, name, section, type, item_code } = req.body;

    try {
      switch (select) {
        case "employee":
          await queryDatabase(
            `INSERT INTO employee (emp_id, emp_name, admin, status)
             VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE emp_name = VALUES(emp_name), admin = VALUES(admin), status = 1`,
            [code, name, type]
          );
          return res.json({ message: "employee inserted or reactivated" });

        case "section":
          await queryDatabase(
            `INSERT INTO section (name, status)
             VALUES (?, 1)
             ON DUPLICATE KEY UPDATE status = 1`,
            [name]
          );
          return res.json({ message: "section inserted or reactivated" });

        case "storage_before":
          await queryDatabase(
            `INSERT INTO storage_location (code, fk_section, type, all_section, status)
             VALUES (?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE fk_section = VALUES(fk_section), all_section = VALUES(all_section), status = 1`,
            [code, section, "before", 0]
          );
          return res.json({
            message: "storage_before inserted or reactivated",
          });

        case "storage_after": {
          const isAllSection = !section ? 1 : 0;
          await queryDatabase(
            `INSERT INTO storage_location (code, fk_section, type, all_section, status)
             VALUES (?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE fk_section = VALUES(fk_section), all_section = VALUES(all_section), status = 1`,
            [code, section || null, "after", isAllSection]
          );
          return res.json({ message: "storage_after inserted or reactivated" });
        }

        case "material":
          await queryDatabase(
            `INSERT INTO material (code, item_code, status)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE item_code = VALUES(item_code), status = 1`,
            [code, item_code]
          );
          return res.json({ message: "material inserted or reactivated" });

        case "location":
          await queryDatabase(
            `INSERT INTO location (name, status)
             VALUES (?, 1)
             ON DUPLICATE KEY UPDATE status = 1`,
            [name]
          );
          return res.json({ message: "location inserted or reactivated" });
      }
    } catch (err) {
      return res.status(500).json({
        error: "Internal server error",
        errno: err.errno,
        details: err.sqlMessage,
      });
    }
  });

  // Edit data
  router.post("/edit/:select/:index", async (req, res) => {
    const { select, index } = req.params;
    const { code, name, section, type, item_code, password } = req.body;

    try {
      let query = "UPDATE ";
      let values = [];
      let setClause = [];
      let config;

      switch (select) {
        case "employee":
          query += "employee SET ";
          config = "emp_id";
          if (name) (setClause.push("emp_name = ?"), values.push(name));
          if (type) (setClause.push("admin = ?"), values.push(type));
          if (password) (setClause.push("password = ?"), values.push(password));
          break;

        case "section":
          query += "section SET ";
          config = "index_section";
          if (name) (setClause.push("name = ?"), values.push(name));
          break;

        case "storage_before":
          query += "storage_location SET ";
          config = "index_storage";
          if (code) (setClause.push("code = ?"), values.push(code));
          if (section) (setClause.push("fk_section = ?"), values.push(section));
          break;

        case "storage_after":
          query += "storage_location SET ";
          config = "index_storage";

          if (code) {
            setClause.push("code = ?");
            values.push(code);
          }

          if (section === "") {
            setClause.push("fk_section = NULL");
            setClause.push("all_section = 1");
          } else if (section !== undefined) {
            setClause.push("fk_section = ?");
            values.push(section);
            setClause.push("all_section = 0");
          }
          break;

        case "material":
          query += "material SET ";
          config = "index_material";
          if (code) (setClause.push("code = ?"), values.push(code));
          if (item_code)
            (setClause.push("item_code = ?"), values.push(item_code));
          break;

        case "location":
          query += "location SET ";
          config = "index_location";
          if (name) (setClause.push("name = ?"), values.push(name));
          break;

        default:
          return res.status(400).json({ error: "Invalid select specified" });
      }

      if (setClause.length === 0) {
        return res.status(400).json({ error: "No data to update" });
      }

      query += setClause.join(", ") + " WHERE " + config + " = ?";
      values.push(index);

      if (select === "storage_before") {
        query += " AND type = 'before'";
      } else if (select === "storage_after") {
        query += " AND type = 'after'";
      }

      await queryDatabase(query, values);
      res.json({ message: "Data has been updated successfully" });
    } catch (err) {
      if ([1062, 1169].includes(err.errno)) {
        return res.status(409).json({
          error: "Duplicate entry error",
          errno: err.errno,
          details: err.sqlMessage,
        });
      }
      return res.status(500).json({
        error: "Internal server error",
        errno: err.errno,
        details: err.sqlMessage,
      });
    }
  });

  // Delete data
  router.delete("/delete/:select/:index", async (req, res) => {
    const { select, index } = req.params;

    try {
      let query;
      let values;

      switch (select) {
        case "employee":
          query = "UPDATE employee SET status = 0 WHERE emp_id = ?";
          values = [index];
          break;
        case "section":
          query = "UPDATE section SET status = 0 WHERE index_section = ?";
          values = [index];
          break;
        case "storage_before":
          query =
            "UPDATE storage_location SET status = 0 WHERE index_storage = ? AND type = 'before'";
          values = [index];
          break;
        case "storage_after":
          query =
            "UPDATE storage_location SET status = 0 WHERE index_storage = ? AND type = 'after'";
          values = [index];
          break;
        case "material":
          query = "UPDATE material SET status = 0 WHERE index_material = ?";
          values = [index];
          break;
        case "location":
          query = "UPDATE location SET status = 0 WHERE index_location = ?";
          values = [index];
          break;

        default:
          return res.status(400).json({ error: "Invalid select specified" });
      }

      await queryDatabase(query, values);
      res.json({ message: "Data has been deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: "Database query error", details: err });
    }
  });

  app.use(router);
  return router;
};
