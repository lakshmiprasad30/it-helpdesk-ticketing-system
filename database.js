/**
 * Simple JSON file database (no native modules, works everywhere)
 * Array-based storage with in-memory state + auto-save to disk
 */
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

let db = { users: [], tickets: [], comments: [], nextTicketId: 1 };
let loaded = false;

const load = () => {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(data);
      db = { ...db, ...parsed };
      loaded = true;
    }
  } catch (err) {
    console.error('Failed to load database:', err.message);
  }
};

const save = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('Failed to save database:', err.message);
  }
};

const findUserByEmail = (email) => {
  return db.users.find(u => u.email === email);
};

const findUserById = (id) => {
  return db.users.find(u => u.id === Number(id));
};

const findTicketById = (id) => {
  return db.tickets.find(t => t.id === Number(id));
};

const escapeHtml = (str) => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Auto-save after every mutation
const originalPush = Array.prototype.push;
Array.prototype.push = function (...items) {
  const result = originalPush.apply(this, items);
  save();
  return result;
};

const originalSplice = Array.prototype.splice;
Array.prototype.splice = function (...args) {
  const result = originalSplice.apply(this, args);
  save();
  return result;
};

const originalUpdate = (obj, key, fn) => {
  obj[key] = fn(obj[key]);
  save();
  return obj;
};

module.exports = {
  db,
  load,
  save,
  findUserByEmail,
  findUserById,
  findTicketById,
  escapeHtml
};

// Load on startup
load();
