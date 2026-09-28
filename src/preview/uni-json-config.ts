import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';

export function uniJsonConfigPlugin(projectRoot, enabled, suppliedTools) {
  const pages = resolve(projectRoot,'src/pages.json');
  const manifest = resolve(projectRoot,'src/manifest.json');
  let tools;
  function parserTools() {
    if (tools) return tools;
    if (suppliedTools) tools = suppliedTools;
    else {
      const requireProject = createRequire(join(projectRoot,'package.json'));
      const sharedPath = requireProject.resolve('@dcloudio/uni-cli-shared');
      const {initPreContext,preJson} = requireProject('@dcloudio/uni-cli-shared');
      const {parse} = createRequire(sharedPath)('jsonc-parser');
      tools = {initPreContext,preJson,parse};
    }
    tools.initPreContext('h5');
    return tools;
  }
  return {
    name:'vibehub-uni-json-config',
    enforce:'pre',
    transform(code,id) {
      if (!enabled || id.includes('?')) return null;
      const filePath = resolve(id);
      if (filePath !== pages && filePath !== manifest) return null;
      const parser = parserTools();
      const source = filePath === pages ? parser.preJson(code,filePath) : code;
      const errors = [];
      const result = parser.parse(source,errors);
      if (errors.length) throw new Error(`Invalid uni JSONC configuration: ${filePath}, error ${errors[0].error}, offset ${errors[0].offset}`);
      return JSON.stringify(result);
    },
  };
}
