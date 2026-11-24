import { execSync } from 'child_process'

process.env.CHROME_PATH = 'C:\\Users\\dell\\AppData\\Local\\ms-playwright\\chromium-1255\\chrome-win64\\chrome.exe'
const outPath = 'C:\\Users\\dell\\.gemini\\antigravity\\brain\\320ccff4-020e-435d-bd4d-d5a4f1c8f974\\lighthouse_home'
const cmd = `npx lighthouse http://127.0.0.1:5173 --output=json,html --output-path=${outPath} --chrome-flags="--headless" --only-categories=accessibility,performance,best-practices,seo`

console.log('Running Lighthouse via Chrome:', process.env.CHROME_PATH)
try {
  const stdout = execSync(cmd, { env: process.env, stdio: 'inherit' })
  console.log('Lighthouse completed!')
} catch (e) {
  console.error('Lighthouse error:', e.message)
}
