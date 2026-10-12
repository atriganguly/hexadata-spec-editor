import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

/**
 * Generates ISO 32000 compliant, print-ready HTML for Puppeteer rendering.
 * Enforces exact 1:1 vector geometry, brand palette hex codes, and Google Fonts.
 */
const generatePrintTemplate = (data) => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="title" content="${data.meta.title || 'HexaData Specification Sheet'}">
      <meta name="author" content="Esconet Technologies Limited / HexaData">
      <meta name="subject" content="Technical Product Specification Datasheet">
      <meta name="generator" content="HexaData Spec Engine v2.0 (Acrobat Studio Standard)">
      <title>${data.meta.title || 'HexaData Spec Sheet'}</title>
      
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:ital,wght@0,400;0,600;0,700;1,400&family=Space+Grotesk:wght@600;700&display=swap');

        /* STRICT A4 VECTOR PAGE RESET */
        @page { 
          size: A4; 
          margin: 0; 
        }
        
        html, body { 
          margin: 0; 
          padding: 0; 
          width: 210mm; 
          height: 297mm; 
          overflow: hidden; 
          background-color: #FFFFFF; 
          box-sizing: border-box; 
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        *, *:before, *:after { 
          box-sizing: inherit; 
        }
        
        /* TYPOGRAPHY SYSTEM */
        body { 
          font-family: 'Inter Tight', sans-serif; 
          position: relative; 
          color: #121E36; 
          background-color: #FFFFFF; 
        }
        
        .font-display { 
          font-family: 'Space Grotesk', sans-serif; 
        }
        
        .font-bold { 
          font-weight: 700; 
        }
        
        /* BRAND COLOR PALETTE (EXACT MATCH) */
        .bg-cyan { background-color: #009bb6; }
        .bg-brand-white { background-color: #F8FAFC; }
        .text-cyan { color: #009bb6; }
        .text-brand-white { color: #F8FAFC; }
        .text-blue { color: #046aa7; }
        .text-black { color: #121E36; }
        .text-link { color: #040F49; }
        .text-grey { color: #A3B1C6; }
        .border-grey { border: 1px solid #A3B1C6; }
        
        /* LAYOUT UTILITIES */
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .justify-between { justify-content: space-between; }
        .items-start { align-items: flex-start; }
        .items-center { align-items: center; }
        .items-end { align-items: flex-end; }
        .flex-1 { flex: 1; }
        .whitespace-pre-wrap { white-space: pre-wrap; }
        
        /* HEADER BAR */
        .header-bar { 
          width: 100%; 
          height: 14mm; 
          display: flex; 
          align-items: center; 
          padding: 0 12mm; 
        }
        
        .header-title { 
          font-weight: 700; 
          font-size: 20pt; 
          margin: 0; 
          color: #F8FAFC;
        }
        
        /* MAIN INNER CONTENT CONTAINER */
        .inner-content { 
          padding: 0 12mm; 
        }
        
        /* TITLE & PARTNER LOGOS AREA */
        .title-area { 
          margin-top: 6mm; 
          margin-bottom: 4mm; 
        }
        
        .main-title { 
          font-size: 24pt; 
          line-height: 1; 
          margin: 0 0 2px 0; 
          color: #046aa7;
        }
        
        .subtitle { 
          font-size: 10pt; 
          margin: 0; 
          color: #046aa7;
        }
        
        /* SLANTED GEOMETRIC TABS (ZERO SUB-PIXEL GAP ENGINE) */
        .cyan-tab-container { 
          display: flex; 
          align-items: flex-end; 
          margin-bottom: 2mm; 
          margin-top: 3mm; 
          position: relative; 
        }
        
        .cyan-tab { 
          background-color: #009bb6; 
          color: #F8FAFC; 
          font-weight: 700; 
          padding: 1.5mm 6mm 1.5mm 4mm; 
          font-size: 8pt; 
          text-transform: uppercase; 
          letter-spacing: 0.5px;
          clip-path: polygon(0 0, calc(100% - 4mm) 0, 100% 100%, 0 100%);
          position: relative;
          z-index: 10;
        }
        
        .cyan-line { 
          flex: 1; 
          height: 1.5px; 
          background-color: #009bb6; 
          margin-left: -2mm; 
          position: relative; 
          z-index: 0; 
        }
        
        /* LISTS & APPLICATION TEXT */
        .list-disc { 
          padding-left: 4mm; 
          font-size: 8pt; 
          line-height: 1.35; 
          margin: 0 0 2mm 0; 
          color: #121E36; 
        }
        
        .list-disc li { 
          padding-left: 1mm; 
          margin-bottom: 1px; 
        }
        
        .app-text { 
          font-size: 8pt; 
          line-height: 1.3; 
          margin: 0; 
          color: #121E36; 
        }
        
        /* SPECIFICATION TABLES */
        table { 
          width: 100%; 
          border-collapse: collapse; 
          font-size: 7.2pt; 
          line-height: 1.25; 
        }
        
        td { 
          padding: 1.5mm 2mm; 
          vertical-align: top; 
          color: #121E36; 
          border: 1px solid #A3B1C6;
        }
        
        .td-label { 
          background-color: #F8FAFC; 
          font-weight: 700; 
          width: 35%; 
        }
        
        /* IMAGES & LOGOS */
        img { 
          max-width: 100%; 
          object-fit: contain; 
        }
        
        .logo-partner { 
          height: 10mm; 
          width: 30mm; 
        }
        
        /* FOOTER & BOTTOM CYAN ACCENT BAR */
        .footer-container { 
          position: absolute; 
          bottom: 8mm; 
          left: 12mm; 
          right: 12mm; 
          display: flex; 
          justify-content: space-between; 
          align-items: flex-end; 
        }
        
        .footer-text { 
          font-size: 6.5pt; 
          line-height: 1.3; 
          margin: 0; 
          color: #A3B1C6; 
        }
        
        .footer-url { 
          font-weight: 700; 
          margin-bottom: 1mm; 
          color: #121E36; 
        }
        
        .bottom-cyan-bar { 
          position: absolute; 
          bottom: 0; 
          left: 0; 
          width: 100%; 
          height: 4mm; 
          background-color: #009bb6; 
        }
      </style>
    </head>
    <body>
      <!-- TOP EDGE-TO-EDGE HEADER BAR -->
      <div class="header-bar bg-cyan">
        <div class="header-title font-display">${data.meta.headerTitle}</div>
      </div>

      <!-- MAIN CONTENT WRAPPER -->
      <div class="inner-content">
        <!-- TITLE & PARTNER LOGOS -->
        <div class="flex justify-between items-start title-area">
          <div class="flex-1 text-blue">
            <div class="main-title font-display font-bold whitespace-pre-wrap">${data.meta.title}</div>
            <div class="subtitle font-bold whitespace-pre-wrap">${data.meta.subtitle}</div>
          </div>
          <div class="flex items-center" style="gap: 4mm; height: 12mm;">
            <img src="${data.images.partnerLogo1}" class="logo-partner" alt="Partner Logo 1" />
            <img src="${data.images.partnerLogo2}" class="logo-partner" alt="Partner Logo 2" />
          </div>
        </div>

        <!-- MIDDLE SECTION (PRODUCT IMAGE & KEY FEATURES) -->
        <div class="flex" style="gap: 8mm; margin-bottom: 2mm;">
          <!-- LEFT: PRODUCT IMAGE -->
          <div class="flex items-center justify-center" style="width: 80mm; padding-top: 6mm;">
            <img src="${data.images.productImage}" style="width: 100%; height: 60mm;" alt="Product Image" />
          </div>
          
          <!-- RIGHT: FEATURES & APPLICATIONS -->
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

        <!-- SPECIFICATIONS TABLE -->
        <div>
          <div class="cyan-tab-container">
            <div class="cyan-tab font-display">Specification</div>
            <div class="cyan-line"></div>
          </div>
          <div class="flex" style="gap: 4mm;">
            <!-- LEFT SPEC TABLE -->
            <div style="width: 50%;">
              <table>
                <tbody>
                  ${data.specsLeft.map(spec => {
                    const isOS = spec.label.includes('OS Compatibility');
                    return `
                    <tr>
                      <td class="td-label whitespace-pre-wrap">${spec.label}</td>
                      <td class="whitespace-pre-wrap ${isOS ? 'text-link font-bold' : ''}">${spec.value}</td>
                    </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- RIGHT SPEC TABLE -->
            <div style="width: 50%;">
              <table>
                <tbody>
                  ${data.specsRight.map(spec => {
                    const isOS = spec.label.includes('OS Compatibility');
                    return `
                    <tr>
                      <td class="td-label whitespace-pre-wrap">${spec.label}</td>
                      <td class="whitespace-pre-wrap ${isOS ? 'text-link font-bold' : ''}">${spec.value}</td>
                    </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- FOOTER & BOTTOM CYAN BAR -->
      <div class="footer-container">
        <div>
          <div class="footer-text footer-url whitespace-pre-wrap">${data.footer.url}</div>
          <div class="footer-text whitespace-pre-wrap" style="margin-bottom: 0.5mm;">${data.footer.disclaimer}</div>
          <div class="footer-text whitespace-pre-wrap">${data.footer.copyright}</div>
        </div>
        <img src="${data.images.footerLogo}" style="height: 12mm; width: 35mm; object-position: right bottom;" alt="HexaData Logo" />
      </div>
      <div class="bottom-cyan-bar"></div>
    </body>
  </html>
`;

// PDF Export API Endpoint
app.post('/export', async (req, res) => {
  try {
    const documentState = req.body;
    
    // Launch headless Chromium with optimal vector rendering flags
    const browser = await puppeteer.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--font-render-hinting=medium'
      ]
    });
    
    const page = await browser.newPage();
    
    // Inject print template with network resource loading confirmation
    await page.setContent(generatePrintTemplate(documentState), { waitUntil: 'load' });
    
    // Generate ISO 32000 compliant A4 PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true 
    });

    await browser.close();

    // Stream PDF buffer with proper headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=HexaData_Datasheet.pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Puppeteer PDF Export Error:", error);
    res.status(500).send('PDF Generation Failed');
  }
});

// Start Server
const PORT = 3001;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`HexaData Acrobat Studio PDF Engine active on http://127.0.0.1:${PORT}`);
});