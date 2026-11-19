import type { TemplateModule } from '../types.ts';
import { Classic } from './Classic.tsx';
import css from './styles.css?inline';
import { createClassicDefaults } from './defaults.ts';

/** Lazy-loaded part of the Classic template (component, CSS, defaults). */
const module: TemplateModule = {
  Component: Classic,
  css,
  createDefaults: createClassicDefaults,
};

export default module;
