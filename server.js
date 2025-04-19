const express = require("express"); //Učitava Express modul — web framework za Node.js koji olakšava pravljenje servera i API ruta.
const fs = require("fs");  //Učitava fs (File System) modul — omogućava rad sa fajlovima: čitanje, pisanje, kreiranje, brisanje, itd.
const path = require("path"); //Učitava path modul — koristi se za sigurno upravljanje putanjama do fajlova/foldera, nezavisno od operativnog sistema.
const bodyParser = require("body-parser"); //Učitava body-parser — middleware koji omogućava Express aplikaciji da čita podatke iz POST zahtjeva (npr. iz HTML forme).
const usbDetect = require("usb-detection"); // Učitava usb-detection modul — omogućava da Node.js detektuje kad se USB uređaji priključe ili isključe.
const open = require("open"); // Učitava open modul — koristi se za automatsko otvaranje URL-a u podrazumijevanom browseru ili aplikaciji.
const drivelist = require("drivelist"); //Učitava drivelist — omogućava listanje svih dostupnih drajvova na računaru (korisno za identifikaciju USB uređaja).
const { exec } = require("child_process"); // Učitava exec funkciju iz Node-ovog child_process modula — omogućava izvršavanje komandne linije (npr. diskpart komande).

const app = express(); //Kreira Express aplikaciju — sada možeš da dodaješ rute, middleware itd.
const PORT = 3000; // Definiše broj porta na kojem će server raditi — http://localhost:3000.
const LOG_PATH = path.join(__dirname, "logs/usb_log.csv"); //Definiše putanju do CSV log fajla gdje će se čuvati podaci — __dirname je trenutni direktorij, a path.join pravi ispravnu putanju.

app.use(bodyParser.urlencoded({ extended: true })); // Middleware koji omogućava da Express parsira x-www-form-urlencoded podatke (tipičan format HTML formi).
app.use(express.static(path.join(__dirname, "public"))); //Postavlja folder public kao statički — sve HTML, CSS, JS fajlove iz tog foldera će browser moći direktno da učita.

if (!fs.existsSync(LOG_PATH)) {  //Provjerava da li log fajl usb_log.csv već postoji.
  fs.writeFileSync(LOG_PATH, "Timestamp,Name,Phone\n"); //Ako fajl ne postoji, kreira ga i upisuje prvi red kao zaglavlje (CSV kolone).
}

app.post("/submit", (req, res) => { //Definiše POST rutu na /submit. Kada korisnik pošalje podatke (npr. ime i broj telefona), ova funkcija se izvršava.
  const { name, phone } = req.body; // Izvlači vrijednosti name i phone iz forme (tj. iz tijela zahtjeva).
  const driveLetter = "3";  

  const timestamp = new Date().toISOString();  //Kreira vremensku oznaku u ISO formatu — koristi se za evidenciju kada je podatak unesen.

  fs.appendFileSync(LOG_PATH, `"${timestamp}","${name}","${phone}","${driveLetter}"\n`); //Dodaje novi red u CSV fajl sa unesenim imenom, brojem telefona, vremenom i drajv oznakom.

  const script = `select volume ${driveLetter}\nassign\nexit`; //Priprema diskpart skriptu koja će ponovo dodijeliti drajv (nakon što je prethodno uklonjen).
  fs.writeFileSync(`assign_${driveLetter}.txt`, script); //Snima tu diskpart skriptu u tekstualni fajl, npr. assign_3.txt.

  exec(`diskpart /s assign_${driveLetter}.txt`, (err) => { // Pokreće diskpart komandu sa prethodno kreiranom skriptom — vraća USB-u drajv oznaku.
    if (err) {
      console.error("Failed to restore drive letter:", err);
      res.sendStatus(500);
    } else {
      console.log(`Drive ${driveLetter} restored`);
      res.sendStatus(200);  
    }
  });
});//Ako je došlo do greške u vraćanju drajva — šalje status 500(internal server error). Ako je uspjelo — status 200 (OK).

app.get("/log", (req, res) => {  //Definiše GET rutu na /log — kada se ova ruta pozove, server će vratiti sve unose iz CSV fajla.
  const csv = fs.readFileSync(LOG_PATH, "utf-8"); //Čita cijeli CSV fajl kao tekst (sadržaj svih unosa).
  const lines = csv.trim().split("\n").slice(1);  //Razdvaja CSV sadržaj u linije, uklanja prazne linije, i preskače prvu (zaglavlje: Timestamp,Name,Phone,...).
  const rows = lines.map(line => line.split(",").map(cell => cell.replace(/\"/g, ""))); //Svaku liniju dijeli po zarezima i uklanja navodnike sa ćelija. Rezultat je niz nizova — [ [timestamp, name, phone, drive], ... ].
  res.json(rows); //Vraća rezultat kao JSON — frontend može koristiti ovo za prikaz logova u tabeli ili slično.
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
}); // Startuje Express server na portu i ispisuje poruku u konzolu da je server aktivan i spreman na zadatoj adresi.

usbDetect.startMonitoring(); //Pokreće praćenje USB uređaja pomoću usb-detection biblioteke.

usbDetect.on("add", async (device) => { //Postavlja listener za događaj "add", tj. kad se novi USB uređaj priključi.
  console.log("USB inserted:", device); //device sadrži podatke o uređaju i ispisuje te podatke u konzolu

  const drives = await drivelist.list(); //Dohvata listu svih detektovanih drajvova (uključujući USB uređaje).
  const usb = drives.find(d => d.isRemovable); // Pronalazi prvi USB uređaj koji je prenosiv (removable).

  if (usb) { //Provjerava da li je pronađen neki validan USB.
    const letter = "3"; 

    console.log("Blocking drive:", letter); //Ispisuje da se "blokira" određeni drive.
    fs.writeFileSync("drive_letter.txt", letter);  //Sprema broj volumena ("3") u fajl drive_letter.txt.
    console.log("Drive letter saved:", letter);

    const script = `select volume ${letter}\nremove\nexit`;  //Kreira tekstualni diskpart skript koji uklanja drive letter odabranom volumenu.
    fs.writeFileSync("remove_drive.txt", script);//Snima taj skript u fajl remove_drive.txt.
    exec("diskpart /s remove_drive.txt", (err) => {  // Izvršava diskpart alat s prethodno kreiranim skriptom za uklanjanje.
      if (err) {//Ako nešto pođe po zlu, ispisuje grešku. Inače, potvrđuje da je drajv uklonjen.
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
      } // Provjerava da li je drive letter i dalje dostupan (da li se može ponovo dodijeliti).
    });// Ako jeste, poziva funkciju assignDriveLetter(letter) da ga vrati. Inače, ispisuje da nije moguće.

    open(`http://localhost:${PORT}`); //Automatski otvara browser na lokalnoj adresi servera.
  }
});

function checkDriveLetterAvailable(driveLetter, callback) {
  drivelist.list((err, drives) => { //Pozivaš drivelist.list, što asinhrono dohvaća sve priključene diskove.
    if (err) {  // Dobijaš err (ako se desi greška) i drives (niz svih diskova).
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
    } //Ako si našao odgovarajući disk, ispisuješ da je dostupan i pozivaš callback(true).
   // Ako nije pronađen, ispisuješ da nije dostupan i pozivaš callback(false).
  });
}

function assignDriveLetter(driveLetter) { //Deklarišeš funkciju koja pokušava dodijeliti dati driveLetter USB uređaju.
  const script = `select volume ${driveLetter}\nassign\nexit`; //Pripremaš tekstualni skript za diskpart alat, assign — dodijeli slovo diska (ako je moguće),exit — izađi iz diskparta.


  fs.writeFileSync(`assign_${driveLetter}.txt`, script); //Snimaš taj skript u .txt fajl, npr. assign_3.txt.
  exec(`diskpart /s assign_${driveLetter}.txt`, (err) => { //Izvršavaš diskpart sa tim skript fajlom kao ulazom.
    if (err) {
      console.error("Failed to restore drive letter:", err); //Ako diskpart nije uspio (npr. ako ne postoji volume 3), ispisuješ grešku.
    } else {
      console.log(`Drive ${driveLetter} restored`);// Ako sve prođe bez greške, ispisuješ da je disk uspješno dodijeljen.
    }
  });
}
