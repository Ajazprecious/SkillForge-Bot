import { adminPage } from "../src/admin.js";

const html=adminPage();
const match=html.match(/<script>([\s\S]*?)<\/script>/i);

if(!match){
  throw new Error("Admin page inline script was not found.");
}

new Function(match[1]);
console.log("Rendered admin page script is valid.");
