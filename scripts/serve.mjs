// npm run serve: static server for local viewing on http://localhost:8080
import { serve } from './lib.mjs';
const { url } = await serve(8080);
console.log('Serving', url);
