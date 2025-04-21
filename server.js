const express = require("express"); //modul — web framework za Node.js koji olakšava pravljenje servera i API ruta.
const fs = require("fs"); 
const path = require("path"); 
const bodyParser = require("body-parser");  //čita podatke iz POST zahtjeva (npr. iz HTML forme).
const usbDetect = require("usb-detection"); 
const open = require("open"); 
const drivelist = require("drivelist"); 
const { exec } = require("child_process"); 

const app = express(); 
const PORT = 3000; 
const LOG_PATH = path.join(__dirname, "logs/usb_log.csv"); 

app.use(bodyParser.urlencoded({ extended: true })); // Middleware koji omogućava da Express parsira tipičan format HTML formi.
app.use(express.static(path.join(__dirname, "public"))); //Postavlja folder public kao statički — sve HTML, CSS, JS fajlove iz tog foldera će browser moći direktno da učita.

if (!fs.existsSync(LOG_PATH)) {  
  fs.writeFileSync(LOG_PATH, "Timestamp,Name,Phone\n"); 
}

app.post("/submit", (req, res) => {
  const driveLetter = "3";  

  const { name, phone } = req.body; 
  const timestamp = new Date().toISOString();  

  fs.appendFileSync(LOG_PATH, `"${timestamp}","${name}","${phone}","${driveLetter}"\n`); 

  const script = `select volume ${driveLetter}\nassign\nexit`; //Priprema diskpart skriptu koja će ponovo dodijeliti drajv (nakon što je prethodno uklonjen).
  fs.writeFileSync(`assign_${driveLetter}.txt`, script); 

  exec(`diskpart /s assign_${driveLetter}.txt`, (err) => { 
    if (err) {
      console.error("Failed to restore drive letter:", err);
      res.sendStatus(500);
    } else {
      console.log(`Drive ${driveLetter} restored`);
      res.sendStatus(200);  
    }
  });
});

app.get("/log", (req, res) => {
  const csv = fs.readFileSync(LOG_PATH, "utf-8"); 
  const lines = csv.trim().split("\n").slice(1);  
  const rows = lines.map(line => line.split(",").map(cell => cell.replace(/\"/g, "")));
  res.json(rows); 
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
}); 

usbDetect.startMonitoring();

usbDetect.on("add", async (device) => { 
  console.log("USB inserted:", device); 

  const drives = await drivelist.list(); 
  const usb = drives.find(d => d.isRemovable); 

  if (usb) { 
    const letter = "3"; 

    console.log("Blocking drive:", letter); 
    fs.writeFileSync("drive_letter.txt", letter);  
    console.log("Drive letter saved:", letter);

    const script = `select volume ${letter}\nremove\nexit`;   //Kreira tekstualni diskpart skript koji uklanja drive letter odabranom volumenu.
    fs.writeFileSync("remove_drive.txt", script); 
    exec("diskpart /s remove_drive.txt", (err) => {  
      if (err) {
        console.error("Failed to remove drive letter:", err);
      } else {
        console.log(`Drive ${letter} removed`);
      }
    });

    checkDriveLetterAvailable(letter, (isAvailable) => {
      if (isAvailable) {
        assignDriveLetter(letter);
      } else {
        console.log(`Drive ${letter} is not available for reassignment.`);
      } 
    });

    open(`http://localhost:${PORT}`); 
  }
});

function checkDriveLetterAvailable(driveLetter, callback) {
  drivelist.list((err, drives) => { 

    if (err) {  
      console.error("Error checking drives:", err);
      return;
    }

    const drive = drives.find(d => d.isRemovable);
     if (drive) {
      console.log(`Drive ${driveLetter} is still available.`);
      callback(true);
    } else {
      console.log(`Drive ${driveLetter} is not available.`);
      callback(false);
    } 
  });
}

function assignDriveLetter(driveLetter) { 
  const script = `select volume ${driveLetter}\nassign\nexit`; 

  fs.writeFileSync(`assign_${driveLetter}.txt`, script); 
  exec(`diskpart /s assign_${driveLetter}.txt`, (err) => { 
    if (err) {
      console.error("Failed to restore drive letter:", err); 
    } else {
      console.log(`Drive ${driveLetter} restored`);
    }
  });
}
