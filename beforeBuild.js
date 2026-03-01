import fs from "fs";
import path from "path";

// read package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "package.json")),
);

const formatBuildDate = (d = new Date()) => {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${mm}-${dd}-${yyyy}`;
};

packageJson.build_date = "ButterLauncher_" + formatBuildDate();

console.log("Setting build date to: " + packageJson.build_date);

fs.writeFileSync(
  path.join(process.cwd(), "package.json"),
  JSON.stringify(packageJson, null, 2),
);
