import "dotenv/config";
import { readFile } from "node:fs/promises";
import express from "express";
import { handle } from "./core.js";

if (!process.env.PRIVATE_KEY && process.env.PRIVATE_KEY_PATH) {
	process.env.PRIVATE_KEY = await readFile(
		process.env.PRIVATE_KEY_PATH,
		"utf8",
	);
}

const app = express();
app.post("/github/webhook", express.raw({ type: "*/*" }), async (req, res) => {
	console.log("Received GitHub webhook");
	const result = await handle({
		headers: req.headers,
		body: req.body.toString("utf8"),
	});
	res.status(result.status).send(result.body);
});
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.listen(process.env.PORT || 3000, () => console.log("dev app listening"));
