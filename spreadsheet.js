// --- Cell class ---
class Cell {
  constructor(id) {
    this.id = id;
    this.raw = '';
    this.value = '';
    this.dependencies = new Set(); // cells this cell depends on
    this.dependents = new Set();   // cells that depend on this cell
    this.error = null;
  }
}

// --- Spreadsheet manager ---
class Spreadsheet {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.cells = {};
    this.colNames = [];
    for (let i = 0; i < cols; i++) {
      this.colNames.push(String.fromCharCode(65 + i));
    }
    for (let c of this.colNames) {
      for (let r = 1; r <= rows; r++) {
        const id = c + r;
        this.cells[id] = new Cell(id);
      }
    }
  }

  setCell(cellId, valueOrFormula) {
    if (!this.cells[cellId]) return;
    const cell = this.cells[cellId];
    cell.raw = valueOrFormula;
    cell.error = null;
    // Remove this cell from dependents of its old dependencies
    for (let dep of cell.dependencies) {
      this.cells[dep]?.dependents.delete(cellId);
    }
    cell.dependencies.clear();
    // Evaluate and update
    this._evaluateCell(cellId, new Set());
    // Update dependents recursively
    this._updateDependents(cellId, new Set());
  }

  getCell(cellId) {
    return this.cells[cellId]?.value;
  }

  _evaluateCell(cellId, visited) {
    const cell = this.cells[cellId];
    if (!cell) return;
    if (visited.has(cellId)) {
      cell.value = '#CIRC';
      cell.error = 'Circular reference';
      return;
    }
    visited.add(cellId);
    let raw = cell.raw.trim();
    if (!raw.startsWith('=')) {
      // Plain value
      if (raw === '') {
        cell.value = '';
      } else if (!isNaN(raw)) {
        cell.value = Number(raw);
      } else {
        cell.value = raw;
      }
      cell.error = null;
      visited.delete(cellId);
      return;
    }
    // Formula
    try {
      // Find all cell references (e.g., A1, B2)
      const refs = raw.match(/[A-E][1-5]/g) || [];
      for (let ref of refs) {
        cell.dependencies.add(ref);
        this.cells[ref]?.dependents.add(cellId);
      }
      // Replace cell references with their values
      let expr = raw.slice(1);
      for (let ref of refs) {
        // Recursively evaluate dependencies
        this._evaluateCell(ref, visited);
        let refVal = this.cells[ref]?.value;
        if (refVal === undefined || refVal === '') refVal = 0;
        if (typeof refVal === 'string' && isNaN(refVal)) refVal = 0;
        expr = expr.replaceAll(ref, '(' + refVal + ')');
      }
      // Evaluate the expression
      // Only allow numbers, parentheses, and + - * /
      if (!/^[-+*/().\d\s]+$/.test(expr)) throw new Error('Invalid formula');
      // eslint-disable-next-line no-eval
      cell.value = Function('return ' + expr)();
      cell.error = null;
    } catch (e) {
      cell.value = '#ERR';
      cell.error = e.message;
    }
    visited.delete(cellId);
  }

  _updateDependents(cellId, visited) {
    if (visited.has(cellId)) return;
    visited.add(cellId);
    const cell = this.cells[cellId];
    for (let dep of cell.dependents) {
      this._evaluateCell(dep, new Set());
      this._updateDependents(dep, visited);
    }
  }
}

// --- UI Integration ---
const COLS = 5, ROWS = 5;
const spreadsheet = new Spreadsheet(COLS, ROWS);

function updateUI(cellId) {
  const cell = spreadsheet.cells[cellId];
  const input = document.getElementById(cellId);
  if (!input) return;
  // Only update value if not focused
  if (document.activeElement !== input) {
    input.value = cell.error ? cell.value : cell.value ?? '';
  }
  if (cell.error) {
    input.title = cell.error;
    input.style.background = '#ffe6e6';
  } else {
    input.title = '';
    input.style.background = '';
  }
}

function updateAllUI() {
  for (let c of spreadsheet.colNames) {
    for (let r = 1; r <= ROWS; r++) {
      updateUI(c + r);
    }
  }
}

// Attach event listeners
window.addEventListener('DOMContentLoaded', () => {
  for (let c of spreadsheet.colNames) {
    for (let r = 1; r <= ROWS; r++) {
      const cellId = c + r;
      const input = document.getElementById(cellId);
      if (!input) continue;
      input.addEventListener('focus', (e) => {
        // Show raw input when editing
        const cell = spreadsheet.cells[cellId];
        input.value = cell.raw;
      });
      input.addEventListener('blur', (e) => {
        spreadsheet.setCell(cellId, input.value);
        updateAllUI();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur();
        }
      });
    }
  }
  updateAllUI();
});

// Expose for console testing
window.setCell = (id, val) => {
  spreadsheet.setCell(id, val);
  updateAllUI();
};
window.getCell = (id) => spreadsheet.getCell(id); 
