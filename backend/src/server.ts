import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import express from "express";
import cors from "cors";
import { strategiesRouter } from "./routes/strategies.js";
import { smartMoneyRouter } from "./routes/smartMoney.js";
import { healthRouter } from "./routes/health.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/strategies", strategiesRouter);
app.use("/smart-money", smartMoneyRouter);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`MirrorCap API listening on http://localhost:${port}`);
});
