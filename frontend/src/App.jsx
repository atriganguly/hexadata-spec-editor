import { create } from 'zustand';
import axios from 'axios';
import { defaultDocumentState } from '@hexadata/shared';
import React, { useRef, useEffect, useState } from 'react';

// --- 1. State Management ---
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

  // Add a new item to an array safely
  addArrayItem: (path, newItem) => set((state) => {
    const keys = path.split('.');
    const newData = { ...state.data };
    let current = newData;
    for (let i = 0; i < keys.length - 1; i++) current = current[keys[i]];
    current[keys[keys.length - 1]] = [...current[keys[keys.length - 1]], newItem];
    return { data: newData };
  }),

  // Remove an item by index securely
  removeArrayItem: (path, index) => set((state) => {
    const keys = path.split('.');
    const newData = { ...state.data };
    let current = newData;
    for (let i = 0; i < keys.length - 1; i++) current = current[keys[i]];
    const array = [...current[keys[keys.length - 1]]];
    array.splice(index, 1);
    current[keys[keys.length - 1]] = array;
    return { data: newData };
  })
}));

// --- 2. Zero-Shift Editable Component (Upgraded for Rich Text) ---
const Editable = ({ value, onChange, className }) => {
  const contentEditableRef = useRef(null);

  // Syncs incoming state updates (using innerHTML to preserve Ctrl+B, Ctrl+I)
  useEffect(() => {
    if (contentEditableRef.current && contentEditableRef.current.innerHTML !== value) {
      contentEditableRef.current.innerHTML = value;
    }
  }, [value]);

  // Saves HTML structure instead of plain text when you click away
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
      className={`outline-none hover:bg-yellow-100 focus:bg-yellow-100 transition-colors cursor-text whitespace-pre-wrap ${className}`}
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
      <div className="absolute inset-0 bg-brand-black bg-opacity-0 group-hover:bg-opacity-10 flex items-center justify-center transition-all border border-dashed border-transparent group-hover:border-brand-cyan">
        <span className="text-white font-body text-[10px] bg-brand-black bg-opacity-60 px-2 py-1 rounded opacity-0 group-hover:opacity-100 shadow-md pointer-events-none">Change</span>
      </div>
    </label>
  );
};

// --- 4. Main UI Layout ---
export default function App() {
  const { data, updateField, addArrayItem, removeArrayItem } = useStore();
  const [isExporting, setIsExporting] = useState(false);

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
    } catch (error) {
      alert("Export failed. Ensure backend is running.");
    }
    setIsExporting(false);
  };

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
    <div className="min-h-screen flex bg-gray-200">
      
      {/* LEFT PANE: Canvas Workspace */}
      <div className="flex-1 flex justify-center py-8 overflow-y-auto">
        
        {/* STRICT A4 CONTAINER */}
        <div className="bg-white shadow-2xl relative overflow-hidden flex flex-col font-body" style={{ width: '210mm', height: '297mm', boxSizing: 'border-box' }}>
          
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
                          className="absolute -left-[4mm] top-0 text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity font-bold text-[12px] leading-none w-4 h-4 flex items-center justify-center z-10 bg-white hover:bg-red-50 rounded"
                          title="Remove Feature"
                        >×</button>
                        <Editable value={feature} onChange={(v) => updateField(`keyFeatures.${index}`, v)} />
                      </li>
                    ))}
                  </ul>
                  <button 
                    onClick={() => addArrayItem('keyFeatures', 'New Key Feature')}
                    className="absolute -bottom-[3mm] left-0 text-[9px] text-brand-cyan border border-dashed border-brand-cyan px-1.5 py-0.5 rounded opacity-0 group-hover/features:opacity-100 transition-opacity bg-white z-10 hover:bg-gray-50 shadow-sm"
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
                
                {/* Left Column Table with Ghost UI */}
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
                                  className="absolute -left-[4mm] top-0 text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity font-bold text-[12px] leading-none w-4 h-4 flex items-center justify-center z-10 bg-white hover:bg-red-50 rounded shadow-sm"
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
                    className="absolute -bottom-[5mm] left-0 text-[9px] text-brand-cyan border border-dashed border-brand-cyan px-1.5 py-0.5 rounded opacity-0 group-hover/table:opacity-100 transition-opacity bg-white z-10 hover:bg-gray-50 shadow-sm"
                  >+ Add Row</button>
                </div>
                
                {/* Right Column Table with Ghost UI */}
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
                                  className="absolute -left-[4mm] top-0 text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity font-bold text-[12px] leading-none w-4 h-4 flex items-center justify-center z-10 bg-white hover:bg-red-50 rounded shadow-sm"
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
                    className="absolute -bottom-[5mm] left-0 text-[9px] text-brand-cyan border border-dashed border-brand-cyan px-1.5 py-0.5 rounded opacity-0 group-hover/table:opacity-100 transition-opacity bg-white z-10 hover:bg-gray-50 shadow-sm"
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

      {/* RIGHT PANE: Dedicated Sidebar Toolbar */}
      <div className="w-80 bg-white shadow-[-4px_0_15px_rgba(0,0,0,0.1)] z-10 flex flex-col p-8 sticky top-0 h-screen border-l border-gray-200">
        <h2 className="text-2xl font-display font-bold text-brand-blue mb-4">HexaData Editor</h2>
        <p className="text-sm font-body text-brand-grey mb-8">
          Make changes directly on the A4 canvas. Click any text to edit it instantly, or click an image to upload a new one.<br/><br/>
          <b>Tip:</b> Hover over lists or table rows to reveal Delete buttons, or hover below them to add new rows. You can also use Ctrl+B to bold text!
        </p>
        
        <button 
          onClick={handleExport} disabled={isExporting}
          className="w-full bg-brand-cyan text-brand-white font-display font-bold py-4 px-4 rounded shadow-md hover:bg-brand-blue disabled:opacity-50 transition-colors"
        >
          {isExporting ? 'Generating PDF...' : 'Download Print-Ready PDF'}
        </button>

        <div className="mt-auto text-xs text-brand-grey font-body border-t border-gray-100 pt-4">
          Strict 1:1 Rendering Engine Active
        </div>
      </div>

    </div>
  );
}