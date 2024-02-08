console.clear();

figma.ui.onmessage = (e) => {
  console.log("code received", e);
  if (e.type === 'EXPORT') {
    exportToJSON();
  } else if (e.type === 'IMPORT') {
    return;
  }
}

function exportToJSON() {
  const collections = figma.variables.getLocalVariableCollections();
  const files:{ fileName: string, body: {}} [] = [];
  collections.forEach((collection) =>
    files.push(...processCollection(collection))
  );
  figma.ui.postMessage({ type: "EXPORT_RESULT", files });
}

function processCollection({ name, modes, variableIds }: VariableCollection) {
  const files: { fileName: string, body: {}}[] = [];
  modes.forEach((mode) => {
    const file = { fileName: `${name}.${mode.name}.tokens.json`, body: {} };
    variableIds.forEach((variableId) => {
      const variable = figma.variables.getVariableById(variableId);
      if (variable !== null) {
        const { name, resolvedType, valuesByMode } = variable;
        const value = valuesByMode[mode.modeId];
        if (value !== undefined && ["COLOR", "FLOAT"].includes(resolvedType)) {
          let obj:{[key:string]: any} = file.body;
          name.split("/").forEach((groupName) => {
            obj[groupName] = obj[groupName] || {};
            obj = obj[groupName];
          });
          obj.$type = resolvedType === "COLOR" ? "color" : "number";
          if (Object.values(value)[0] === "VARIABLE_ALIAS") {
            obj.$value = `{${figma.variables.getVariableById(Object.values(value)[1])?.name.replace(/\//g, ".")}}`;
          } else if (resolvedType === 'COLOR') {
            obj.$value = rgbToHex(value);
          } else {
            obj.$value = value;
          }
        }
      }
    });
    files.push(file);
  });
  return files;
}

function rgbToHex( colorValue: VariableValue) {
  const { r, g, b, a } = colorValue as any;
  if (a !== 1 && a !== undefined) {
    return `rgba(${[r, g, b]
      .map((n) => Math.round(n * 255))
      .join(", ")}, ${a.toFixed(4)})`;
  }
  const toHex = (value: any) => {
    const hex = Math.round(value * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  const hex = [toHex(r), toHex(g), toHex(b)].join("");
  return `#${hex}`;
}

if (figma.command === "import") {
  figma.showUI(__uiFiles__["import"], {
    width: 500,
    height: 500,
    themeColors: true,
  });
} else if (figma.command === "export") {
  figma.showUI(__uiFiles__["export"], {
    width: 500,
    height: 500,
    themeColors: true,
  });
}
