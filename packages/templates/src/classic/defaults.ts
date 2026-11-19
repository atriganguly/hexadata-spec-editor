import { createEmptyContent, rt, type SpecRow, type SpecSheetContent } from '@hexadata/spec-core';

const row = (id: string, label: string, value: string, emphasis = false): SpecRow => ({
  id: `r-${id}`,
  label: rt(label),
  value: rt(value),
  emphasis,
});

/**
 * The sample HD-RS2200 sheet the editor opens with. A factory: every call returns fresh objects, so
 * "Reset" can never be affected by earlier edits (the bug of the original shared default object).
 */
export function createClassicDefaults(): SpecSheetContent {
  const content = createEmptyContent();

  content.meta = {
    headerTitle: rt('HexaData Server System'),
    title: rt('HD-RS2200 Version : G294'),
    subtitle: rt('HPC/AI Server - AMD EPYC™ 9005/9004 - 2U DP 4 x PCIe Gen5 GPUs'),
  };

  content.partnerLogos = [
    { id: 'logo-1', ref: 'builtin:partner-logo-1' },
    { id: 'logo-2', ref: 'builtin:partner-logo-2' },
  ];
  content.productImage = 'builtin:product-placeholder';

  content.keyFeatures = [
    'Supports up to 4 x Dual slot Gen5 GPUs',
    'Supports 4 x NVIDIA H200 NVL PCIe GPUs',
    'Dual AMD EPYC™ 9005/9004 Series Processors',
    '12-Channel DDR5 RDIMM, 24 x DIMMs',
    '2 x 10Gb/s LAN ports via Broadcom® BCM57416',
    '4 x 2.5" Gen5 NVMe/SATA/SAS-4 hot-swap bays',
    '4 x 2.5" SATA/SAS-4 hot-swap bays',
    '4 x FHFL PCIe Gen5 x16 or 8 x FHFL PCIe Gen5 x8 slots for GPUs',
    '2 x LP PCIe Gen5 x16 slots for add-in cards',
    'Dual 3000W 80 PLUS Titanium redundant power supply',
  ].map((text, index) => ({ id: `kf-${index + 1}`, text: rt(text) }));

  content.applications = rt(
    'AI Platform, AI Training Server, AI Inference Server, Visual\nComputing, High-Performance Computing Server...',
  );

  content.specColumns = [
    [
      row('l1', 'Dimensions', '2U (W448 x H87.5 x D962 mm, depth incl. 112 mm rear fans)'),
      row('l2', 'Motherboard', 'MZ43-G20'),
      row(
        'l3',
        'CPU',
        'AMD EPYC™ 9005 Series Processors\nAMD EPYC™ 9004 Series Processors\nDual processor, cTDP up to 240W\n- At 30°C ambient, cTDP up to 300W',
      ),
      row('l4', 'OS Compatibility', 'Please Refer to OS Compatibility Guide', true),
      row('l5', 'Socket', '2 x LGA 6096 (Socket SP5)'),
      row('l6', 'Chipset', 'System on Chip'),
      row(
        'l7',
        'Memory',
        '12-Channel DDR5 RDIMM, 24 x DIMMs\n[EPYC 9005] Up to 6400 MT/s\n[EPYC 9004] Up to 4800 MT/s',
      ),
      row(
        'l8',
        'LAN',
        '2 x 10Gb/s LAN (1 x Broadcom® BCM57416), Support NCSI\n1 x 10/100/1000 Mbps Management LAN',
      ),
      row('l9', 'Video', 'Integrated in ASPEED® AST2600\n- 1 x VGA port'),
      row(
        'l10',
        'Storage',
        'Front hot-swap:\n4 x 2.5" Gen5 NVMe/SATA/SAS-4 [1]\n4 x 2.5" SATA/SAS-4 [1]\n\n[1] SAS card is required to support SAS drives.',
      ),
      row('l11', 'RAID', 'Require RAID add-in cards'),
    ],
    [
      row(
        'r1',
        'PCIe Expansion\nSlots',
        '4 x FHFL PCIe Gen5x16 or 8 x FHFL PCIe Gen5x8, for GPUs\n2 x LP PCIe Gen5 x16, for add-in cards\n\n*The system supports 4 x NVIDIA H200 NVL PCIe GPUs at 25°C\nambient, arranged as four individual GPUs without NVLink bridge support.',
      ),
      row('r2', 'I/O Ports', 'Rear:\n2 x USB 3.2 Gen1, 1 x VGA, 2 x RJ45, 1 x MLAN'),
      row('r3', 'Backplane Board', 'PCIe Gen5 x4 or SATA 6Gb/s or SAS-4 24Gb/s'),
      row('r4', 'TPM', '1 x TPM header (SPI), Optional TPM2.0 kit: CTM010'),
      row(
        'r5',
        'Power Supply',
        'Dual 3000W 80 PLUS Titanium redundant power supply\nAC Input: 100-240V\n\n*The system power supply requires C19 power cord.',
      ),
      row(
        'r6',
        'System\nManagement',
        'ASPEED® AST2600 Baseboard Management Controller\nHexaData Management Console web interface',
      ),
      row('r7', 'System Fans', '8 x 80x80x80mm'),
      row(
        'r8',
        'Operating\nProperties',
        'Operating: 10°C to 35°C, 8% to 80% (non-condensing)\nNon-operating: -40°C to 60°C, 20% to 95% (non-condensing)',
      ),
      row(
        'r9',
        'Packaging\nContent',
        '1 x HD-RS2200 ver : G294\n2 x CPU heatsinks\n4 x GPU power cables (16-pin, 250mm)\n1 x L-shape Rail kit',
      ),
      row('r10', 'Ordering Part\nNumbers', '6NG294Z41DR000ACP2*'),
    ],
  ];

  content.footer = {
    url: rt('Learn more at: https://www.hexadata.in'),
    disclaimer: rt(
      '* All specifications are subject to change without notice. Please visit our website for the latest information.\n* All trademarks and logos are the properties of their respective holders.',
    ),
    copyright: rt('© 2026 Esconet Technologies Limited. All rights reserved.'),
  };

  return content;
}
