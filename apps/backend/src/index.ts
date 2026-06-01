import "dotenv/config";
import app from "./app.js";

const port = Number(process.env["PORT"] ?? 3000);

app.listen(port, () => {
  console.log(`Backend Las Brasas corriendo en http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
});
