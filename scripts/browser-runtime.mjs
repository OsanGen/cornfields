import {createRequire} from 'node:module';
// Optional verification adapter: reuse an installed Playwright and browser.
// No browser download and no changes to the shared skill client.
const require=createRequire(import.meta.url);
const playwright=require(process.env.CORNFIELD_PLAYWRIGHT_MODULE||'playwright');
export const chromium=playwright.chromium;
if(process.env.CORNFIELD_BROWSER_EXECUTABLE){
  const launch=chromium.launch.bind(chromium);
  chromium.launch=async options=>{
    const adapted={...options,executablePath:process.env.CORNFIELD_BROWSER_EXECUTABLE};
    if(process.env.CORNFIELD_NATIVE_GPU==='1')adapted.args=(adapted.args||[]).filter(arg=>!arg.startsWith('--use-gl=')&&!arg.startsWith('--use-angle='));
    const browser=await launch(adapted);
    if(process.env.CORNFIELD_FOCUS_BROWSER==='1'){
      const newPage=browser.newPage.bind(browser);
      browser.newPage=async(...args)=>{
        const page=await newPage(...args),goto=page.goto.bind(page);
        page.goto=async(...args)=>{const result=await goto(...args);await page.bringToFront();return result;};
        return page;
      };
    }
    return browser;
  };
}
