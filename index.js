import { parse } from "csv-parse";

import { Database } from "bun:sqlite";
const express = require("express");
const app = express();

const db = new Database("mydatabase.db");

// Set the view engine to ejs
app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static("public"));

// Create the Requests table
db.run(`
    CREATE TABLE IF NOT EXISTS Requests (
        RequestID INTEGER PRIMARY KEY,
        RequestType INTEGER,
        RequestStatus INTEGER
    )
`);

// Creating tables for each request type

// NewLicenseRequests
db.run(`
    CREATE TABLE IF NOT EXISTS NewLicenseRequests (
        RequestID INTEGER PRIMARY KEY,
        CompanyName TEXT,
        LicenceType TEXT,
        IsOffice BOOLEAN,
        OfficeName TEXT,
        OfficeServiceNumber TEXT,
        RequestDate TEXT,
        Activities TEXT,
        FOREIGN KEY (RequestID) REFERENCES Requests (RequestID)
    )
`);

// AccountRequests
db.run(`
    CREATE TABLE IF NOT EXISTS AccountRequests (
        RequestID INTEGER PRIMARY KEY,
        CompanyName TEXT,
        RequesterName TEXT,
        ApplicantName TEXT,
        UserName TEXT,
        ContactEmail TEXT,
        Permissions TEXT,
        FOREIGN KEY (RequestID) REFERENCES Requests (RequestID)
    )
`);

// InspectionRequests
db.run(`
    CREATE TABLE IF NOT EXISTS InspectionRequests (
        RequestID INTEGER PRIMARY KEY,
        CompanyName TEXT,
        InspectionDate TEXT,
        InspectionTime TEXT,
        InspectionType TEXT,
        FOREIGN KEY (RequestID) REFERENCES Requests (RequestID)
    )
`);

// Add Activity Request
db.run(`
    CREATE TABLE IF NOT EXISTS AddActivityRequests (
        RequestID INTEGER PRIMARY KEY,
        CompanyName TEXT,
        LicenceID TEXT,
        Activities TEXT,
        FOREIGN KEY (RequestID) REFERENCES Requests (RequestID)
    )
`);

// StampLicenseRequest
db.run(`
    CREATE TABLE IF NOT EXISTS StampLicenseRequests (
        RequestID INTEGER PRIMARY KEY,
        CompanyName TEXT,
        LicenceID TEXT,
        RequestDate TEXT,
        FOREIGN KEY (RequestID) REFERENCES Requests (RequestID)
    )
`);

// let query = db.query('SELECT * FROM Requests');
// console.log(query.all())
//  query = db.query('SELECT * FROM StampLicenseRequests');
// console.log(query.all())

async function parseAndInsertData(csvContent, res) {
  const startTime = Date.now(); // Start timing that I use to calculate the time

  let newLicenseCount = 0,
    accountRequestCount = 0,
    inspectionRequestCount = 0,
    addActivityCount = 0,
    stampLicenseCount = 0;

  parse(
    csvContent,
    {
      columns: true,
      skip_empty_lines: true,
    },
    async (err, records) => {
      if (err) {
        console.error("Error parsing CSV:", err);
        return;
      }

      if (!records.length) {
        console.error("No records to process.");
        return;
      }

      await db.run("BEGIN"); // Start a transaction

      try {
        for (const record of records) {
          const requestData = JSON.parse(record.RequestData);

          // Insert general request info into Requests table
          const insertRequest = db.prepare(
            `INSERT INTO Requests (RequestID, RequestType, RequestStatus) VALUES (?, ?, ?)`
          );
          await insertRequest.run(
            record.RequestID,
            record.RequestType,
            record.RequestStatus
          );

          try {
            record.RequestType = parseInt(record.RequestType, 10); // Convert to integer since data is string
            // console.log("Request Type:", record.RequestType, "Type of Request Type:", typeof record.RequestType);
            switch (record.RequestType) {
              case 1: // New License
                newLicenseCount++;
                const insertNewLicense = db.prepare(
                  `INSERT INTO NewLicenseRequests (RequestID, CompanyName, LicenceType, IsOffice, OfficeName, OfficeServiceNumber, RequestDate, Activities) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
                );
                await insertNewLicense.run(
                  record.RequestID,
                  requestData.CompanyName,
                  requestData.LicenceType,
                  requestData.IsOffice,
                  requestData.OfficeName,
                  requestData.OfficeServiceNumber,
                  requestData.RequestDate,
                  requestData.Activities
                );
                break;
              case 2: // Account Request
                accountRequestCount++;
                const insertAccountRequest = db.prepare(
                  `INSERT INTO AccountRequests (RequestID, CompanyName, RequesterName, ApplicantName, UserName, ContactEmail, Permissions) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`
                );
                await insertAccountRequest.run(
                  record.RequestID,
                  requestData.CompanyName,
                  requestData.RequesterName,
                  requestData.ApplicantName,
                  requestData.UserName,
                  requestData.ContactEmail,
                  JSON.stringify(requestData.Permissions)
                );
                break;
              case 3: // Inspection Request
                inspectionRequestCount++;
                const insertInspectionRequest = db.prepare(
                  `INSERT INTO InspectionRequests (RequestID, CompanyName, InspectionDate, InspectionTime, InspectionType) 
                                 VALUES (?, ?, ?, ?, ?)`
                );
                await insertInspectionRequest.run(
                  record.RequestID,
                  requestData.CompanyName,
                  requestData.InspectionDate,
                  requestData.InspectionTime,
                  requestData.InspectionType
                );
                break;
              case 4: // Add New Activity
                addActivityCount++;
                const insertAddActivity = db.prepare(
                  `INSERT INTO AddActivityRequests (RequestID, CompanyName, LicenceID, Activities) 
                                 VALUES (?, ?, ?, ?)`
                );
                await insertAddActivity.run(
                  record.RequestID,
                  requestData.CompanyName,
                  requestData.LicenceID,
                  JSON.stringify(requestData.Activities)
                );
                break;
              case 5: // Stamp License Letter
                stampLicenseCount++;
                const insertStampLicense = db.prepare(
                  `INSERT INTO StampLicenseRequests (RequestID, CompanyName, LicenceID, RequestDate) 
                                 VALUES (?, ?, ?, ?)`
                );
                await insertStampLicense.run(
                  record.RequestID,
                  requestData.CompanyName,
                  requestData.LicenceID,
                  requestData.RequestDate
                );
                break;
            }
          } catch (subError) {
            console.error(
              "Failed to insert specific data for RequestID:",
              record.RequestID,
              "Error:",
              subError
            );
          }
        }

        await db.run("COMMIT"); // Commit the transaction if all operations are successful
        const endTime = Date.now();
        const totalTime = endTime - startTime; //Time it took to be inserted

        const summary = {
          newLicenseCount,
          accountRequestCount,
          inspectionRequestCount,
          addActivityCount,
          stampLicenseCount,
          totalTime: `${totalTime} ms`,
        };

        // Render an EJS template with the summary data
        res.render("summary", { summary }); // 'summary' is the name of your EJS file
      } catch (error) {
        console.error("Failed to insert data:", error);
        await db.run("ROLLBACK"); // Rollback the transaction on error
      } finally {
        db.close(); // Always close the database connection
      }
    }
  );
}

app.post("/upload-csv", (req, res) => {
  let chunks = [];
  req.on("data", (chunk) => {
    chunks.push(chunk);
  });
  req.on("end", async () => {
    const body = Buffer.concat(chunks).toString();
    const boundary = body.split("\r\n")[0];
    const part =
      body.split(boundary).find((part) => part.includes('filename="')) || "";
    const content = part.split("\r\n\r\n")[1]?.trim();
    if (!content) {
      res.status(400).send("No CSV file uploaded");
      return;
    }

    await parseAndInsertData(content, res);
  });
});

app.get("/", (req, res) => {
  res.render("index");
});

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});
