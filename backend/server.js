// backend/server.js
import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const generatePrintTemplate = (data) => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;600;700&family=Space+Grotesk:wght@400;600;700&display=swap');

        /* STRICT A4 RESET */
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; overflow: hidden; background: white; box-sizing: border-box; }
        *, *:before, *:after { box-sizing: inherit; }
        
        /* Typography System */
        body { font-family: 'Inter Tight', sans-serif; position: relative; color: #121E36; background-color: #FFFFFF; }
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-bold { font-weight: bold; }
        
        /* Brand Colors mapped exactly to provided hex codes */
        .bg-cyan { background-color: #009bb6; }
        .bg-brand-white { background-color: #F8FAFC; }
        .text-cyan { color: #009bb6; }
        .text-brand-white { color: #F8FAFC; }
        .text-blue { color: #046aa7; }
        .text-black { color: #121E36; }
        .text-link { color: #040F49; }
        .text-grey { color: #A3B1C6; }
        .border-grey { border: 1px solid #A3B1C6; }
        
        /* Layout Utilities */
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .justify-between { justify-content: space-between; }
        .items-start { align-items: flex-start; }
        .items-center { align-items: center; }
        .items-end { align-items: flex-end; }
        .flex-1 { flex: 1; }
        .whitespace-pre-wrap { white-space: pre-wrap; }
        
        /* Header Bar */
        .header-bar { width: 100%; height: 14mm; display: flex; align-items: center; padding: 0 12mm; }
        .header-title { font-weight: bold; font-size: 20pt; margin: 0; }
        
        /* Main Inner Content */
        .inner-content { padding: 0 12mm; }
        
        /* Title Area */
        .title-area { margin-top: 6mm; margin-bottom: 4mm; }
        .main-title { font-size: 24pt; line-height: 1; margin: 0 0 2px 0; }
        .subtitle { font-size: 10pt; margin: 0; }
        
        /* Slanted Geometric Tabs */
        .cyan-tab-container { display: flex; align-items: flex-end; margin-bottom: 2mm; margin-top: 3mm; position: relative; }
        .cyan-tab { 
          background-color: #009bb6; 
          color: #F8FAFC; 
          font-weight: bold; 
          padding: 1.5mm 6mm 1.5mm 4mm; 
          font-size: 8pt; 
          text-transform: uppercase; 
          letter-spacing: 0.5px;
          clip-path: polygon(0 0, calc(100% - 4mm) 0, 100% 100%, 0 100%);
          position: relative;
          z-index: 10;
        }
        /* Negative margin ensures it slides cleanly under the tab, eliminating rendering gaps */
        .cyan-line { flex: 1; height: 1.5px; background-color: #009bb6; margin-left: -2mm; position: relative; z-index: 0; }
        
        /* Lists & Text */
        .list-disc { padding-left: 4mm; font-size: 8pt; line-height: 1.35; margin: 0 0 2mm 0; color: #121E36; }
        .list-disc li { padding-left: 1mm; margin-bottom: 1px; }
        .app-text { font-size: 8pt; line-height: 1.3; margin: 0; color: #121E36; }
        
        /* Tables */
        table { width: 100%; border-collapse: collapse; font-size: 7.2pt; line-height: 1.25; }
        td { padding: 1.5mm 2mm; vertical-align: top; color: #121E36; }
        .td-label { background-color: #F8FAFC; font-weight: bold; width: 35%; }
        
        /* Images */
        img { max-width: 100%; object-fit: contain; }
        .logo-partner { height: 10mm; width: 30mm; }
        
        /* Footer */
        .footer-container { position: absolute; bottom: 8mm; left: 12mm; right: 12mm; display: flex; justify-content: space-between; align-items: flex-end; }
        .footer-text { font-size: 6.5pt; line-height: 1.3; margin: 0; color: #A3B1C6; }
        .footer-url { font-weight: bold; margin-bottom: 1mm; color: #121E36; }
        .bottom-cyan-bar { position: absolute; bottom: 0; left: 0; width: 100%; height: 4mm; background-color: #009bb6; }
      </style>
    </head>
    <body>
      <!-- Top Bar -->
      <div class="header-bar bg-cyan text-brand-white">
        <div class="header-title font-display">${data.meta.headerTitle}</div>
      </div>

      <div class="inner-content">
        <!-- Title & Logos -->
        <div class="flex justify-between items-start title-area">
          <div class="flex-1 text-blue">
            <div class="main-title font-display font-bold whitespace-pre-wrap">${data.meta.title}</div>
            <div class="subtitle font-bold whitespace-pre-wrap">${data.meta.subtitle}</div>
          </div>
          <div class="flex items-center" style="gap: 4mm; height: 12mm;">
            <img src="${data.images.partnerLogo1}" class="logo-partner" />
            <img src="${data.images.partnerLogo2}" class="logo-partner" />
          </div>
        </div>

        <!-- Middle Section -->
        <div class="flex" style="gap: 8mm; margin-bottom: 2mm;">
          <!-- Left: Product Image -->
          <div class="flex items-center justify-center" style="width: 80mm; padding-top: 6mm;">
            <img src="${data.images.productImage}" style="width: 100%; height: 60mm;" />
          </div>
          
          <!-- Right: Features -->
          <div class="flex-1">
            <div class="cyan-tab-container">
              <div class="cyan-tab font-display">Key Features</div>
              <div class="cyan-line"></div>
            </div>
            <ul class="list-disc">
              ${data.keyFeatures.map(f => `<li><span class="whitespace-pre-wrap">${f}</span></li>`).join('')}
            </ul>
            
            <div class="cyan-tab-container">
              <div class="cyan-tab font-display">Applications</div>
              <div class="cyan-line"></div>
            </div>
            <div class="app-text whitespace-pre-wrap">${data.applications}</div>
          </div>
        </div>

        <!-- Specifications -->
        <div>
          <div class="cyan-tab-container">
            <div class="cyan-tab font-display">Specification</div>
            <div class="cyan-line"></div>
          </div>
          <div class="flex" style="gap: 4mm;">
            <div style="width: 50%;">
              <table>
                ${data.specsLeft.map(spec => {
                  const isOS = spec.label.includes('OS Compatibility');
                  return `
                  <tr>
                    <td class="td-label border-grey whitespace-pre-wrap">${spec.label}</td>
                    <td class="border-grey whitespace-pre-wrap ${isOS ? 'text-link font-bold' : ''}">${spec.value}</td>
                  </tr>
                  `
                }).join('')}
              </table>
            </div>
            <div style="width: 50%;">
              <table>
                ${data.specsRight.map(spec => {
                  const isOS = spec.label.includes('OS Compatibility');
                  return `
                  <tr>
                    <td class="td-label border-grey whitespace-pre-wrap">${spec.label}</td>
                    <td class="border-grey whitespace-pre-wrap ${isOS ? 'text-link font-bold' : ''}">${spec.value}</td>
                  </tr>
                  `
                }).join('')}
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer & Bottom Bar -->
      <div class="footer-container">
        <div>
          <div class="footer-text footer-url whitespace-pre-wrap">${data.footer.url}</div>
          <div class="footer-text whitespace-pre-wrap" style="margin-bottom: 0.5mm;">${data.footer.disclaimer}</div>
          <div class="footer-text whitespace-pre-wrap">${data.footer.copyright}</div>
        </div>
        <img src="${data.images.footerLogo}" style="height: 12mm; width: 35mm; object-position: right bottom;" />
      </div>
      <div class="bottom-cyan-bar"></div>
    </body>
  </html>
`;

app.post('/export', async (req, res) => {
  try {
    const documentState = req.body;
    
    const browser = await puppeteer.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote'
      ]
    });
    
    const page = await browser.newPage();
    
    // Safely waits for local execution without timing out
    await page.setContent(generatePrintTemplate(documentState), { waitUntil: 'load' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true 
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=HexaData_Datasheet.pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Puppeteer Error:", error);
    res.status(500).send('PDF Generation Failed');
  }
});

app.listen(3001, '127.0.0.1', () => console.log('PDF Engine running on port 3001'));