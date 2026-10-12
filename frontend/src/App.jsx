import { create } from 'zustand';
import axios from 'axios';
import { defaultDocumentState } from '@hexadata/shared';
import React, { useRef, useEffect, useState } from 'react';

// --- 1. State Management Store ---
const useStore = create((set) => ({
  data: defaultDocumentState,
  
  updateField: (path, value) => set((state) => {
    const keys = path.split('.');
    const newData = { ...state.data };
    let current = newData;
    for (let i = 0; i < keys.length - 1; i++) current = current[keys[i]];
    current[keys[keys.length - 1]] = value;
    return { data: newData };
  }),

  addArrayItem: (path, newItem) => set((state) => {
    const keys = path.split('.');
    const newData = { ...state.data };
    let current = newData;
    for (let i = 0; i < keys.length - 1; i++) current = current[keys[i]];
    current[keys[keys.length - 1]] = [...current[keys[keys.length - 1]], newItem];
    return { data: newData };
  }),

  removeArrayItem: (path, index) => set((state) => {
    const keys = path.split('.');
    const newData = { ...state.data };
    let current = newData;
    for (let i = 0; i < keys.length - 1; i++) current = current[keys[i]];
    const array = [...current[keys[keys.length - 1]]];
    array.splice(index, 1);
    current[keys[keys.length - 1]] = array;
    return { data: newData };
  }),

  resetData: () => set({ data: defaultDocumentState })
}));

// --- 2. Zero-Shift Rich-Text Editable Component ---
const Editable = ({ value, onChange, className }) => {
  const contentEditableRef = useRef(null);

  useEffect(() => {
    if (contentEditableRef.current && contentEditableRef.current.innerHTML !== value) {
      contentEditableRef.current.innerHTML = value;
    }
  }, [value]);

  const handleBlur = () => {
    if (contentEditableRef.current) {
      onChange(contentEditableRef.current.innerHTML);
    }
  };

  return (
    <div
      ref={contentEditableRef}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      className={`outline-none hover:bg-yellow-100/40 focus:bg-yellow-100/50 transition-colors cursor-text whitespace-pre-wrap ${className}`}
      style={{ minWidth: '1em' }}
      dangerouslySetInnerHTML={{ __html: value }}
    />
  );
};

// --- 3. Editable Image Component ---
const EditableImage = ({ value, onChange, className, contain = true }) => {
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => onChange(reader.result);
      reader.readAsDataURL(file);
    }
  };

  return (
    <label className={`cursor-pointer group relative flex ${className}`} title="Click to replace image">
      <input type="file" className="hidden" accept="image/*" onChange={handleFile} />
      <img src={value} alt="Uploadable" className={`w-full h-full ${contain ? 'object-contain' : 'object-cover'}`} />
      <div className="absolute inset-0 bg-brand-black bg-opacity-0 group-hover:bg-opacity-20 flex items-center justify-center transition-all border border-dashed border-transparent group-hover:border-brand-cyan rounded">
        <span className="text-white font-body text-[10px] bg-brand-black/80 backdrop-blur-md px-2 py-1 rounded opacity-0 group-hover:opacity-100 shadow-md pointer-events-none transition-opacity">Change Image</span>
      </div>
    </label>
  );
};

// --- 4. Main App Component ---
export default function App() {
  const { data, updateField, addArrayItem, removeArrayItem, resetData } = useStore();
  const [isExporting, setIsExporting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState(null);

  // PDF Export Handler
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await axios.post('http://127.0.0.1:3001/export', data, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'HexaData_Datasheet.pdf');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      alert("Export failed. Please ensure the backend server is running on port 3001.");
    }
    setIsExporting(false);
  };

  // Zoom Controls
  const zoomIn = () => setZoom((prev) => Math.min(prev + 0.1, 1.5));
  const zoomOut = () => setZoom((prev) => Math.max(prev - 0.1, 0.5));
  const resetZoom = () => setZoom(1);

  // Seamless Zero-Gap Slanted Tab
  const CyanTab = ({ title }) => (
    <div className="flex items-end mb-[2mm] mt-[3mm] relative">
      <div 
        className="bg-brand-cyan text-brand-white font-display font-bold px-[4mm] py-[1.5mm] text-[8pt] uppercase tracking-wide relative z-10"
        style={{
          clipPath: 'polygon(0 0, calc(100% - 4mm) 0, 100% 100%, 0 100%)',
          paddingRight: '6mm'
        }}
      >
        {title}
      </div>
      <div className="flex-1 h-[1.5px] bg-brand-cyan -ml-[2mm] relative z-0"></div>
    </div>
  );

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#0d131f] text-[#F8FAFC] relative overflow-hidden font-body select-none">
      
      {/* BACKGROUND AMBIENT LIQUID GLOWS */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand-cyan/20 rounded-full blur-[140px] pointer-events-none animate-pulse-glow"></div>
      <div className="absolute bottom-[-10%] right-[10%] w-[600px] h-[600px] bg-brand-blue/20 rounded-full blur-[160px] pointer-events-none animate-pulse-glow"></div>

      {/* TOP COMPACT STUDIO HEADER */}
      <header className="h-14 px-6 flex items-center justify-between border-b border-white/10 bg-black/20 backdrop-blur-2xl z-20">
        <div className="flex items-center gap-3">
          {/* Header Logo */}
<img 
  src="/favicon.png" 
  alt="HexaData Icon" 
  className="w-8 h-8 object-contain drop-shadow-[0_2px_8px_rgba(0,155,182,0.4)]" 
/>
          <div>
            <h1 className="font-display font-bold text-sm text-white tracking-wide flex items-center gap-2">
              HexaData Spec Editor
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30 uppercase tracking-wider">
                Beta 1.0
              </span>
            </h1>
            <p className="text-[10px] text-brand-grey">Acrobat-compatible Vector PDF Editing</p>
          </div>
        </div>

        {/* TOP STATUS INDICATOR */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-brand-grey font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            READY
          </span>
          <span className="text-white/20">|</span>
          <span>A4 (210mm x 297mm)</span>
        </div>
      </header>

      {/* MAIN CANVAS WORKSPACE */}
      <main className="flex-1 overflow-auto flex justify-center py-10 px-4 relative z-10 custom-scrollbar">
        
        {/* TRANSFORM WRAPPER FOR SMOOTH ZOOM ENGINE */}
        <div 
          className="transition-transform duration-200 ease-out origin-top flex justify-center"
          style={{ transform: `scale(${zoom})` }}
        >
          {/* STRICT A4 CONTAINER (210mm x 297mm) */}
          <div 
            className="bg-white text-brand-black shadow-paper-a4 relative overflow-hidden flex flex-col font-body select-text" 
            style={{ width: '210mm', height: '297mm', minWidth: '210mm', minHeight: '297mm', boxSizing: 'border-box' }}
          >
            
            {/* TOP EDGE-TO-EDGE HEADER */}
            <div className="w-full bg-brand-cyan h-[14mm] flex items-center px-[12mm]">
              <Editable value={data.meta.headerTitle} onChange={(v) => updateField('meta.headerTitle', v)} className="text-brand-white font-display font-bold text-[20pt]" />
            </div>

            {/* INNER CONTENT WRAPPER */}
            <div className="px-[12mm] flex-1 flex flex-col">
              
              {/* TITLE & LOGOS */}
              <div className="flex justify-between items-start mt-[6mm] mb-[4mm]">
                <div className="flex-1">
                  <Editable value={data.meta.title} onChange={(v) => updateField('meta.title', v)} className="font-bold font-display text-brand-blue text-[24pt] leading-none mb-1" />
                  <Editable value={data.meta.subtitle} onChange={(v) => updateField('meta.subtitle', v)} className="font-bold font-body text-brand-blue text-[10pt]" />
                </div>
                <div className="flex gap-[4mm] items-center h-[12mm]">
                  <EditableImage value={data.images.partnerLogo1} onChange={(v) => updateField('images.partnerLogo1', v)} className="h-[10mm] w-[30mm]" />
                  <EditableImage value={data.images.partnerLogo2} onChange={(v) => updateField('images.partnerLogo2', v)} className="h-[10mm] w-[30mm]" />
                </div>
              </div>

              {/* MIDDLE SECTION */}
              <div className="flex gap-[8mm] mb-[2mm]">
                {/* Left: Product Image */}
                <div className="w-[80mm] flex items-center justify-center pt-[6mm]">
                  <EditableImage value={data.images.productImage} onChange={(v) => updateField('images.productImage', v)} className="w-full h-[60mm]" />
                </div>
                
                {/* Right: Features & Applications */}
                <div className="flex-1">
                  <CyanTab title="Key Features" />
                  
                  {/* Ghost UI Wrapper for List */}
                  <div className="relative group/features">
                    <ul className="list-disc pl-[4mm] text-brand-black font-body text-[8pt] leading-[1.35] mb-[2mm]">
                      {data.keyFeatures.map((feature, index) => (
                        <li key={index} className="pl-1 group/item relative">
                          <button 
                            onClick={() => removeArrayItem('keyFeatures', index)}
                            className="absolute -left-[4mm] top-0 text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity font-bold text-[12px] leading-none w-4 h-4 flex items-center justify-center z-10 bg-white hover:bg-red-50 rounded shadow-sm cursor-pointer"
                            title="Remove Feature"
                          >×</button>
                          <Editable value={feature} onChange={(v) => updateField(`keyFeatures.${index}`, v)} />
                        </li>
                      ))}
                    </ul>
                    <button 
                      onClick={() => addArrayItem('keyFeatures', 'New Key Feature')}
                      className="absolute -bottom-[3mm] left-0 text-[9px] text-brand-cyan border border-dashed border-brand-cyan px-1.5 py-0.5 rounded opacity-0 group-hover/features:opacity-100 transition-opacity bg-white z-10 hover:bg-gray-50 shadow-sm cursor-pointer"
                    >+ Add Feature</button>
                  </div>
                  
                  <CyanTab title="Applications" />
                  <Editable value={data.applications} onChange={(v) => updateField('applications', v)} className="text-brand-black font-body text-[8pt] leading-[1.3]" />
                </div>
              </div>

              {/* SPECIFICATIONS TABLE */}
              <div>
                <CyanTab title="Specification" />
                <div className="flex gap-[4mm]">
                  
                  {/* Left Column Table */}
                  <div className="w-1/2 relative group/table">
                    <table className="w-full border-collapse text-[7.2pt] leading-[1.25]">
                      <tbody>
                        {data.specsLeft.map((spec, idx) => {
                          const isOS = spec.label.includes('OS Compatibility');
                          return (
                            <tr key={idx}>
                              <td className="border border-brand-grey bg-brand-white font-bold text-brand-black align-top w-[35%]" style={{ padding: '1.5mm 2mm' }}>
                                <div className="relative group/row">
                                  <button 
                                    onClick={() => removeArrayItem('specsLeft', idx)}
                                    className="absolute -left-[4mm] top-0 text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity font-bold text-[12px] leading-none w-4 h-4 flex items-center justify-center z-10 bg-white hover:bg-red-50 rounded shadow-sm cursor-pointer"
                                    title="Remove Row"
                                  >×</button>
                                  <Editable value={spec.label} onChange={(v) => updateField(`specsLeft.${idx}.label`, v)} />
                                </div>
                              </td>
                              <td className={`border border-brand-grey align-top ${isOS ? 'text-brand-link font-bold' : 'text-brand-black'}`} style={{ padding: '1.5mm 2mm' }}>
                                <Editable value={spec.value} onChange={(v) => updateField(`specsLeft.${idx}.value`, v)} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <button 
                      onClick={() => addArrayItem('specsLeft', {label: 'New Label', value: 'New Value'})}
                      className="absolute -bottom-[5mm] left-0 text-[9px] text-brand-cyan border border-dashed border-brand-cyan px-1.5 py-0.5 rounded opacity-0 group-hover/table:opacity-100 transition-opacity bg-white z-10 hover:bg-gray-50 shadow-sm cursor-pointer"
                    >+ Add Row</button>
                  </div>
                  
                  {/* Right Column Table */}
                  <div className="w-1/2 relative group/table">
                    <table className="w-full border-collapse text-[7.2pt] leading-[1.25]">
                      <tbody>
                        {data.specsRight.map((spec, idx) => {
                          const isOS = spec.label.includes('OS Compatibility');
                          return (
                            <tr key={idx}>
                              <td className="border border-brand-grey bg-brand-white font-bold text-brand-black align-top w-[35%]" style={{ padding: '1.5mm 2mm' }}>
                                <div className="relative group/row">
                                  <button 
                                    onClick={() => removeArrayItem('specsRight', idx)}
                                    className="absolute -left-[4mm] top-0 text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity font-bold text-[12px] leading-none w-4 h-4 flex items-center justify-center z-10 bg-white hover:bg-red-50 rounded shadow-sm cursor-pointer"
                                    title="Remove Row"
                                  >×</button>
                                  <Editable value={spec.label} onChange={(v) => updateField(`specsRight.${idx}.label`, v)} />
                                </div>
                              </td>
                              <td className={`border border-brand-grey align-top ${isOS ? 'text-brand-link font-bold' : 'text-brand-black'}`} style={{ padding: '1.5mm 2mm' }}>
                                <Editable value={spec.value} onChange={(v) => updateField(`specsRight.${idx}.value`, v)} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <button 
                      onClick={() => addArrayItem('specsRight', {label: 'New Label', value: 'New Value'})}
                      className="absolute -bottom-[5mm] left-0 text-[9px] text-brand-cyan border border-dashed border-brand-cyan px-1.5 py-0.5 rounded opacity-0 group-hover/table:opacity-100 transition-opacity bg-white z-10 hover:bg-gray-50 shadow-sm cursor-pointer"
                    >+ Add Row</button>
                  </div>

                </div>
              </div>

            </div>

            {/* FOOTER */}
            <div className="absolute bottom-[8mm] left-[12mm] right-[12mm] flex justify-between items-end">
              <div className="text-[6.5pt] text-brand-grey font-body leading-[1.3]">
                <Editable value={data.footer.url} onChange={(v) => updateField('footer.url', v)} className="text-brand-black font-bold block mb-[1mm]" />
                <Editable value={data.footer.disclaimer} onChange={(v) => updateField('footer.disclaimer', v)} className="block mb-[0.5mm]" />
                <Editable value={data.footer.copyright} onChange={(v) => updateField('footer.copyright', v)} className="block" />
              </div>
              <EditableImage value={data.images.footerLogo} onChange={(v) => updateField('images.footerLogo', v)} className="h-[12mm] w-[35mm] object-right-bottom" />
            </div>
            
            {/* BOTTOM EDGE-TO-EDGE CYAN BAR */}
            <div className="absolute bottom-0 left-0 w-full bg-brand-cyan h-[4mm]"></div>

          </div>
        </div>

      </main>

      {/* FLOATING LIQUID GLASS TOOLBAR DOCK (macOS 27 Golden Gate Style) */}
      <aside className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-3 p-2.5 rounded-2xl glass-dock">
        
        {/* PRIMARY ACTION: EXPORT PDF */}
        <div className="relative group">
          <button
            onClick={handleExport}
            disabled={isExporting}
            onMouseEnter={() => setActiveTooltip('export')}
            onMouseLeave={() => setActiveTooltip(null)}
            className="w-12 h-12 rounded-xl glass-button-primary flex items-center justify-center text-white disabled:opacity-50 cursor-pointer"
            aria-label="Export PDF"
          >
            {isExporting ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
            )}
          </button>
          
          {/* TOOLTIP */}
          {activeTooltip === 'export' && (
            <div className="absolute right-16 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-black/90 backdrop-blur-md text-white text-xs font-medium whitespace-nowrap shadow-xl border border-white/10 pointer-events-none">
              Export Print-Ready PDF
            </div>
          )}
        </div>

        <div className="w-8 h-[1px] bg-white/10 my-1"></div>

        {/* ZOOM IN */}
        <div className="relative">
          <button
            onClick={zoomIn}
            onMouseEnter={() => setActiveTooltip('zoomin')}
            onMouseLeave={() => setActiveTooltip(null)}
            className="w-10 h-10 rounded-lg glass-button flex items-center justify-center text-white/90 hover:text-white cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"></path>
            </svg>
          </button>
          {activeTooltip === 'zoomin' && (
            <div className="absolute right-14 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-black/90 backdrop-blur-md text-white text-xs font-medium whitespace-nowrap shadow-xl border border-white/10 pointer-events-none">
              Zoom In ({Math.round(zoom * 100)}%)
            </div>
          )}
        </div>

        {/* ZOOM OUT */}
        <div className="relative">
          <button
            onClick={zoomOut}
            onMouseEnter={() => setActiveTooltip('zoomout')}
            onMouseLeave={() => setActiveTooltip(null)}
            className="w-10 h-10 rounded-lg glass-button flex items-center justify-center text-white/90 hover:text-white cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"></path>
            </svg>
          </button>
          {activeTooltip === 'zoomout' && (
            <div className="absolute right-14 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-black/90 backdrop-blur-md text-white text-xs font-medium whitespace-nowrap shadow-xl border border-white/10 pointer-events-none">
              Zoom Out ({Math.round(zoom * 100)}%)
            </div>
          )}
        </div>

        {/* RESET ZOOM */}
        <div className="relative">
          <button
            onClick={resetZoom}
            onMouseEnter={() => setActiveTooltip('zoomreset')}
            onMouseLeave={() => setActiveTooltip(null)}
            className="w-10 h-10 rounded-lg glass-button flex items-center justify-center text-white/90 hover:text-white font-mono text-xs font-bold cursor-pointer"
          >
            1:1
          </button>
          {activeTooltip === 'zoomreset' && (
            <div className="absolute right-14 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-black/90 backdrop-blur-md text-white text-xs font-medium whitespace-nowrap shadow-xl border border-white/10 pointer-events-none">
              Fit 100% View
            </div>
          )}
        </div>

        <div className="w-8 h-[1px] bg-white/10 my-1"></div>

        {/* FORMATTING & EDITOR INFO */}
        <div className="relative">
          <button
            onClick={() => setShowInfoModal(true)}
            onMouseEnter={() => setActiveTooltip('info')}
            onMouseLeave={() => setActiveTooltip(null)}
            className="w-10 h-10 rounded-lg glass-button flex items-center justify-center text-white/90 hover:text-white cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </button>
          {activeTooltip === 'info' && (
            <div className="absolute right-14 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-black/90 backdrop-blur-md text-white text-xs font-medium whitespace-nowrap shadow-xl border border-white/10 pointer-events-none">
              Editor Shortcuts & Help
            </div>
          )}
        </div>

        {/* RESET DATA */}
        <div className="relative">
          <button
            onClick={() => setShowResetConfirm(true)}
            onMouseEnter={() => setActiveTooltip('reset')}
            onMouseLeave={() => setActiveTooltip(null)}
            className="w-10 h-10 rounded-lg glass-button flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </button>
          {activeTooltip === 'reset' && (
            <div className="absolute right-14 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-black/90 backdrop-blur-md text-white text-xs font-medium whitespace-nowrap shadow-xl border border-white/10 pointer-events-none">
              Reset Template Data
            </div>
          )}
        </div>

      </aside>

      {/* INFO / SHORTCUTS MODAL */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="w-full max-w-md p-6 rounded-2xl glass-panel shadow-2xl relative border border-white/20">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
              <h3 className="font-display font-bold text-lg text-white">Editor Controls & Shortcuts</h3>
              <button onClick={() => setShowInfoModal(false)} className="text-white/60 hover:text-white text-xl cursor-pointer">×</button>
            </div>
            <div className="space-y-3 text-sm text-brand-grey font-body">
              <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg border border-white/5">
                <span>Bold Text</span>
                <kbd className="px-2 py-1 bg-white/10 rounded font-mono text-xs text-white">Ctrl + B</kbd>
              </div>
              <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg border border-white/5">
                <span>Italic Text</span>
                <kbd className="px-2 py-1 bg-white/10 rounded font-mono text-xs text-white">Ctrl + I</kbd>
              </div>
              <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg border border-white/5">
                <span>Underline Text</span>
                <kbd className="px-2 py-1 bg-white/10 rounded font-mono text-xs text-white">Ctrl + U</kbd>
              </div>
              <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg border border-white/5">
                <span>Add / Delete Rows</span>
                <span className="text-xs text-brand-cyan">Hover over lists or tables</span>
              </div>
              <div className="flex justify-between items-center bg-white/5 p-2.5 rounded-lg border border-white/5">
                <span>Replace Images</span>
                <span className="text-xs text-brand-cyan">Click directly on any image</span>
              </div>
            </div>
            <button
              onClick={() => setShowInfoModal(false)}
              className="mt-6 w-full py-2.5 rounded-xl glass-button-primary text-white font-display font-bold text-sm cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* CONFIRM RESET MODAL */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="w-full max-w-sm p-6 rounded-2xl glass-panel shadow-2xl relative border border-white/20">
            <h3 className="font-display font-bold text-lg text-white mb-2">Reset All Template Data?</h3>
            <p className="text-sm text-brand-grey mb-6">
              This will discard all your current text edits and image changes, restoring the default HexaData specification sheet.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 rounded-xl glass-button text-white font-display font-bold text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  resetData();
                  setShowResetConfirm(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500/80 hover:bg-red-500 text-white font-display font-bold text-sm shadow-lg border border-red-400/30 cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}