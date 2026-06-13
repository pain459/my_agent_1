import { exportTrainingData } from "../src/trainingExporter.js";

const result = await exportTrainingData({
  outputPath: process.argv[2],
});

console.log(`Exported ${result.recordCount} approved training records to ${result.outputPath}.`);
