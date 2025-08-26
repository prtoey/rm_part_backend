const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const port = 3004;
const path = require("path");
const app = express();
const fileUpload = require("express-fileupload");

const uploadOpts = {
  useTempFiles: true,
  tempFileDir: path.join(__dirname, "../tmp"),
};

app.use(fileUpload(uploadOpts));

const connection = mysql.createPool({
  host: "172.16.41.9",
  user: "pmd",
  password: "pmd445566",
  database: "rm_part",
  port: "3306",
});

app.use(cors());

// const inputRoute = require("./api/inputInvoice")(app, connection, uploadOpts);
const dataRoute = require("./api/data")(app, connection, uploadOpts);
// const manageRoute = require("./api/manageInvoice")(app, connection, uploadOpts);
// const exportRoute = require("./api/exportInvoice")(app, connection, uploadOpts);

// Use routes
// app.use("/inputInvoice", inputRoute);
app.use("/data", dataRoute);
// app.use("/manageInvoice", manageRoute);
// app.use("/exportInvoice", exportRoute);

// USE WHEN DEPLOYING FRONTEND --------------------------------------//

// app.use(express.static(path.join(__dirname, "../frontend/dist")));

// app.get("*", (req, res) => {
//   res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
// });

app.listen(port, () => {
  console.log(`Server is running`);
});
