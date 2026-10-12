// shared/index.js
export const defaultDocumentState = {
  images: {
    partnerLogo1: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNTAgNTAiPjx0ZXh0IHk9IjM1IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjNzZiOTAwIj5OVklESUE8L3RleHQ+PC9zdmc+",
    partnerLogo2: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNTAgNTAiPjx0ZXh0IHk9IjM1IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZWQwMDAwIj5BTUQgRVBZQzwvdGV4dD48L3N2Zz4=",
    productImage: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MDAgMjAwIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjIwMCIgeT0iMTAwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjAiIGZpbGw9IiNhMGEwYTAiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlByb2R1Y3QgSW1hZ2UgUGxhY2Vob2xkZXI8L3RleHQ+PC9zdmc+",
    footerLogo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNTAgNjAiPjx0ZXh0IHk9IjQwIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iNDAiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjMDA1YjlmIj5IZXhhRGF0YTwvdGV4dD48L3N2Zz4="
  },
  meta: {
    headerTitle: "HexaData Server System",
    title: "HD-RS2200 Version : G294",
    subtitle: "HPC/AI Server - AMD EPYC™ 9005/9004 - 2U DP 4 x PCIe Gen5 GPUs"
  },
  keyFeatures: [
    "Supports up to 4 x Dual slot Gen5 GPUs",
    "Supports 4 x NVIDIA H200 NVL PCIe GPUs",
    "Dual AMD EPYC™ 9005/9004 Series Processors",
    "12-Channel DDR5 RDIMM, 24 x DIMMs",
    "2 x 10Gb/s LAN ports via Broadcom® BCM57416",
    "4 x 2.5\" Gen5 NVMe/SATA/SAS-4 hot-swap bays",
    "4 x 2.5\" SATA/SAS-4 hot-swap bays",
    "4 x FHFL PCIe Gen5 x16 or 8 x FHFL PCIe Gen5 x8 slots for GPUs",
    "2 x LP PCIe Gen5 x16 slots for add-in cards",
    "Dual 3000W 80 PLUS Titanium redundant power supply"
  ],
  applications: "AI Platform, AI Training Server, AI Inference Server, Visual\nComputing, High-Performance Computing Server...",
  specsLeft: [
    { label: "Dimensions", value: "2U (W448 x H87.5 x D962 mm, depth incl. 112 mm rear fans)" },
    { label: "Motherboard", value: "MZ43-G20" },
    { label: "CPU", value: "AMD EPYC™ 9005 Series Processors\nAMD EPYC™ 9004 Series Processors\nDual processor, cTDP up to 240W\n- At 30°C ambient, cTDP up to 300W" },
    { label: "OS Compatibility", value: "Please Refer to OS Compatibility Guide" },
    { label: "Socket", value: "2 x LGA 6096 (Socket SP5)" },
    { label: "Chipset", value: "System on Chip" },
    { label: "Memory", value: "12-Channel DDR5 RDIMM, 24 x DIMMs\n[EPYC 9005] Up to 6400 MT/s\n[EPYC 9004] Up to 4800 MT/s" },
    { label: "LAN", value: "2 x 10Gb/s LAN (1 x Broadcom® BCM57416), Support NCSI\n1 x 10/100/1000 Mbps Management LAN" },
    { label: "Video", value: "Integrated in ASPEED® AST2600\n- 1 x VGA port" },
    { label: "Storage", value: "Front hot-swap:\n4 x 2.5\" Gen5 NVMe/SATA/SAS-4 [1]\n4 x 2.5\" SATA/SAS-4 [1]\n\n[1] SAS card is required to support SAS drives." },
    { label: "RAID", value: "Require RAID add-in cards" }
  ],
  specsRight: [
    { label: "PCIe Expansion\nSlots", value: "4 x FHFL PCIe Gen5x16 or 8 x FHFL PCIe Gen5x8, for GPUs\n2 x LP PCIe Gen5 x16, for add-in cards\n\n*The system supports 4 x NVIDIA H200 NVL PCIe GPUs at 25°C\nambient, arranged as four individual GPUs without NVLink bridge support." },
    { label: "I/O Ports", value: "Rear:\n2 x USB 3.2 Gen1, 1 x VGA, 2 x RJ45, 1 x MLAN" },
    { label: "Backplane Board", value: "PCIe Gen5 x4 or SATA 6Gb/s or SAS-4 24Gb/s" },
    { label: "TPM", value: "1 x TPM header (SPI), Optional TPM2.0 kit: CTM010" },
    { label: "Power Supply", value: "Dual 3000W 80 PLUS Titanium redundant power supply\nAC Input: 100-240V\n\n*The system power supply requires C19 power cord." },
    { label: "System\nManagement", value: "ASPEED® AST2600 Baseboard Management Controller\nHexdata Management Console web interface" },
    { label: "System Fans", value: "8 x 80x80x80mm" },
    { label: "Operating\nProperties", value: "Operating: 10°C to 35°C, 8% to 80% (non-condensing)\nNon-operating: -40°C to 60°C, 20% to 95% (non-condensing)" },
    { label: "Packaging\nContent", value: "1 x HD-RS2200 ver : G294\n2 x CPU heatsinks\n4 x GPU power cables (16-pin, 250mm)\n1 x L-shape Rail kit" },
    { label: "Ordering Part\nNumbers", value: "6NG294Z41DR000ACP2*" }
  ],
  footer: {
    url: "Learn more at: https://www.hexadata.in",
    disclaimer: "* All specifications are subject to change without notice. Please visit our website for the latest information.\n* All trademarks and logos are the properties of their respective holders.",
    copyright: "© 2026 Escanet Technologies Limited,. Ltd. All rights reserved."
  }
};