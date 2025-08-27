const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 8000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

let medicines = require("./data/medicines.json");
let espQueue = [];  // This holds dispense instructions for ESP32
let storeQueue = [];  // This holds dispense instructions for ESP32

// --- API Routes ---

// GET all medicines
app.get("/api/medicines", (req, res) => {
  res.json(medicines);
});

// GET categories
app.get("/api/categories", (req, res) => {
  const categories = [...new Set(medicines.map(m => m.category))];
  res.json(["All Medicines", ...categories]);
});

// POST dispense
app.post("/api/dispense", (req, res) => {
  const items = req.body;

  const notFound = items.find(item => !medicines.find(m => m.id === item.id));
  if (notFound) return res.status(404).json({ error: `Item ${notFound.id} not found` });

  const outOfStock = items.find(item => {
    const med = medicines.find(m => m.id === item.id);
    return med.stock < item.quantity;
  });

  if (outOfStock) return res.status(400).json({ error: `Not enough stock for ${outOfStock.id}` });

  items.forEach(item => {
    const med = medicines.find(m => m.id === item.id);
    med.stock -= item.quantity;
  });

  // Push whole order as a group
  // storeQueue.push({ store: items, timestamp: Date.now() })
  espQueue.push({ order: items, timestamp: Date.now() });


  res.json({ status: "success", dispensed: items });
});

// GET stock for single medicine
app.get("/api/stock/:id", (req, res) => {
  const med = medicines.find(m => m.id === req.params.id);
  if (!med) return res.status(404).json({ error: "Not found" });
  res.json({ id: med.id, stock: med.stock });
});

// GET next group of items for ESP
app.get('/api/esp/next', (req, res) => {
  if (espQueue.length === 0) {
    return res.status(204).send(); // No Content
  }

  const nextOrder = espQueue.shift(); // Remove and return first full order
  res.json(nextOrder);
});
app.get('/api/esp/store', (req, res) => {
  if (storeQueue.length === 0) {
    return res.status(204).send(); // No Content
  }
  const storeOrder = storeQueue.shift(); // Remove and return first full order
  res.json(storeOrder);
});


// GET peek next group for ESP
app.get('/api/esp/peek', (req, res) => {
  if (espQueue.length === 0) {
    return res.status(204).send(); // No Content
  }

  res.json(espQueue[0]); // Just peek without removing
});


app.post('/api/esp/flush', (req, res) => {
  espQueue = [];
  res.json({ status: 'flushed' });
});


// Utility function to save medicines to file
function saveMedicinesToFile() {
  fs.writeFileSync(
    path.join(__dirname, "data", "medicines.json"),
    JSON.stringify(medicines, null, 2)
  );
}

// Add or restock an item (with image URL required for new items only)
app.post("/api/stock/update", (req, res) => {
  const { id, name, category, price, quantity, image } = req.body;

  if (!id || typeof quantity !== "number") {
    return res.status(400).json({ error: "ID and quantity are required." });
  }

  let med = medicines.find(m => m.id === id);

  if (quantity === 0 && med) {
    medicines = medicines.filter(item => item.id !== id);
    saveMedicinesToFile();
    return res.json({ status: "deleted", medicine: med });
  }

  if (med) {
    med.stock = parseInt(med.stock) + parseInt(quantity);
    let temp = { ...med, stock: quantity };
    storeQueue.push({ store: temp, timestamp: Date.now() });
    saveMedicinesToFile();
    return res.json({ status: "restocked", medicine: med });
  }

  if (!name || !category || typeof price !== "number" || !image) {
    return res.status(400).json({ error: "Missing data for new item (name, category, price, image required)." });
  }

  const newMed = { id, name, category, price, stock: quantity, image };
  medicines.push(newMed);
  storeQueue.push({ store: newMed, timestamp: Date.now() });
  saveMedicinesToFile();
  return res.json({ status: "added", medicine: newMed });
});



// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve Admin Panel
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});


app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
