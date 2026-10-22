// Taastab näidisandmed (data/seed.json). Kasulik enne demo esitamist.
import { openDb, seed } from './db.js';
const db = openDb(); seed(db); console.log('Näidisandmed taastatud.');
