
require("dotenv").config();

const { Client } = require("pg");

const client = new Client({
connectionString: process.env.DIRECT_URL,
  connectionTimeoutMillis: 15000,
});

async function main() {
  try {
    await client.connect();

    const result = await client.query("SELECT NOW()");

    console.log("Connexion Neon réussie !");
    console.log(result.rows);
  } catch (error) {
    console.error("Erreur de connexion :", error);
  } finally {
    await client.end();
  }
}

main();
