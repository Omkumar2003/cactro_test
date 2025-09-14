#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import chalk from "chalk";

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to PDF inside the npm package
const pdfPath = path.join(__dirname, "Om_kumar_Resume.pdf");

// Ensure PDF exists
if (!fs.existsSync(pdfPath)) {
  console.error(chalk.red("PDF file not found at:"), pdfPath);
  process.exit(1);
}

// Read PDF into Uint8Array
const pdfData = new Uint8Array(fs.readFileSync(pdfPath));

// Utils
const isBold = (fontName = "") => /Bold|Medium|Semibold|Heavy/i.test(fontName);

const isSectionHeader = (text) => {
  const keywords = ["education", "experience", "projects", "skills", "certifications"];
  return keywords.some((word) => text.toLowerCase().startsWith(word));
};

const isProjectTitle = (text) =>
  text.match(/^[A-Z0-9\s\-():]+$/) && text.length > 5;

const isGithubLink = (text) => text.includes("github.com");

const skillCategories = [
  "Programming Languages:",
  "Frameworks/Libraries:",
  "Tools:",
  "Cloud/DevOps:",
  "Technological Concepts:",
  "Soft Skills:",
];

const highlightSkillKey = (line) => {
  for (const key of skillCategories) {
    if (line.includes(key)) {
      return line.replace(
        key,
        chalk.magenta.bold(key.replace(":", "")) + chalk.white(":")
      );
    }
  }
  return line;
};

const formatLineWithSpacing = (lineItems) => {
  const sorted = lineItems.sort((a, b) => a.x - b.x);
  let output = "";
  let lastX = 0;

  for (const item of sorted) {
    const gap = item.x - lastX;
    if (gap > 10) output += "\t";
    else if (gap > 5) output += " ";

    const text = isBold(item.fontName) ? chalk.bold(item.str) : item.str;
    output += text;
    lastX = item.x + item.str.length * 5;
  }

  return output.trim();
};

// Hyperlink helper
const makeHyperlink = (text, url) =>
  `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;

// Main extraction
async function extractFormattedText(pdfData) {
  const loadingTask = getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const annotations = await page.getAnnotations();

    const links = annotations
      .filter((ann) => ann.url && ann.rect)
      .map((ann) => ({ url: ann.url, rect: ann.rect }));

    const lines = [];
    let currentLine = [];
    let lastY = null;

    for (const item of content.items) {
      const str = item.str.trim();
      if (!str) continue;

      const y = item.transform[5];
      const x = item.transform[4];
      const fontName = item.fontName || "";

      if (lastY === null || Math.abs(y - lastY) > 5) {
        if (currentLine.length > 0) lines.push(currentLine);
        currentLine = [];
      }

      const link = links.find((link) => {
        const [x1, y1, x2, y2] = link.rect;
        return x >= x1 && x <= x2 && y >= y1 && y <= y2;
      });

      currentLine.push({
        str: link ? makeHyperlink(chalk.blue.underline(str), link.url) : str,
        raw: str,
        x,
        y,
        fontName,
      });

      lastY = y;
    }

    if (currentLine.length > 0) lines.push(currentLine);

    let inProjects = false;
    let inExperience = false;
    let inEducation = false;
    let lastProjectIndex = -2;
    let eduBuffer = [];

    for (let i = 0; i < lines.length; i++) {
      const lineItems = lines[i];
      const rawLine = lineItems.map((i) => i.raw).join(" ").trim();
      const formattedLine = formatLineWithSpacing(lineItems);

      if (!rawLine) continue;

      // Section headers
      if (isSectionHeader(rawLine)) {
        inProjects = rawLine.toLowerCase().includes("project");
        inExperience = rawLine.toLowerCase().includes("experience");
        inEducation = rawLine.toLowerCase().includes("education");

        eduBuffer = [];
        console.log("\n" + chalk.yellow.bold.underline(rawLine.toUpperCase()));
        continue;
      }

      // Education formatting
      if (inEducation) {
        eduBuffer.push(formattedLine);
        if (eduBuffer.length === 2) {
          console.log(
            chalk.bold(eduBuffer[0].trim()) +
              "\n" +
              chalk.gray("\t" + eduBuffer[1].trim()) +
              "\n"
          );
          eduBuffer = [];
        }
        continue;
      }

      // Experience formatting
      if (inExperience) {
        if (
          isBold(lineItems[0]?.fontName || "") &&
          lineItems.length === 1 &&
          rawLine.length < 40
        ) {
          console.log("\n" + chalk.cyan.bold.underline(rawLine));
          continue;
        }
        console.log(formattedLine);
        continue;
      }

      // Project titles
      if (inProjects && isProjectTitle(rawLine) && i - lastProjectIndex > 1) {
        console.log();
        console.log(chalk.cyan.bold.underline(formattedLine));
        lastProjectIndex = i;
        continue;
      }

      // GitHub links
      if (inProjects && isGithubLink(rawLine)) {
        console.log(formattedLine);
        continue;
      }

      // Tech stack line
      if (inProjects && /^[A-Za-z,\s]+$/.test(rawLine) && rawLine.length < 100) {
        console.log(chalk.gray.italic(formattedLine));
        continue;
      }

      // Skills
      if (!inProjects && skillCategories.some((key) => rawLine.includes(key))) {
        console.log(highlightSkillKey(formattedLine));
        continue;
      }

      // "Verify" links
      if (rawLine.toLowerCase().includes("verify")) {
        console.log(formattedLine);
        continue;
      }

      // Default
      console.log(formattedLine);

      if (inProjects && i + 1 < lines.length) {
        const nextRaw = lines[i + 1].map((i) => i.raw).join(" ").trim();
        if (isProjectTitle(nextRaw)) console.log();
      }
    }
  }
}

// Run with error handling
extractFormattedText(pdfData).catch((err) => {
  console.error(chalk.red("Error parsing PDF:"), err);
});
