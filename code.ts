console.clear();

// Import JSON

type TokenType = {
  id?: string;
  collection: VariableCollection;
  modeId: string;
  type: VariableResolvedDataType;
  name: string;
  value: VariableValue;
};

type AliasType = {
  key: string;
  type: 'VARIABLE_ALIAS',
  valueKey: string;
};

type VariableType = {
  collection: VariableCollection;
  modeId: string;
  name?: string;
  key: string;
  valueKey: string;
  tokens: {[key:string]: any};
};

function createCollection(name: string) {
  const collection = figma.variables.createVariableCollection(name);
  const modeId = collection.modes[0].modeId;
  return { collection, modeId };
}

function createToken({collection, modeId, type, name, value}: TokenType) {
  const token = figma.variables.createVariable(name, collection.id, type);
  token.setValueForMode(modeId, value);
  return token;
}

function createVariable({collection, modeId, key, valueKey, tokens}: VariableType) {
  const token = tokens[valueKey];
  return createToken({id: key, collection, modeId, type: 'COLOR', name: key, value: { type: "VARIABLE_ALIAS", id: `${token.id}` } });
}

type JSONfile = {
  fileName: string;
  body: string;
};

function importJSONFile({ fileName, body }: JSONfile) {
  const json = JSON.parse(body);
  const { collection, modeId } = createCollection(fileName);
  const aliases = {};
  const tokens = {};

  Object.entries(json).forEach(([key, object]) => {
    traverseToken({
      collection,
      modeId,
      type: json.$type,
      key,
      object,
      tokens,
      aliases,
    });
  });
  processAliases({ collection, modeId, aliases, tokens });
}

type AliasProccessed = {
  collection: VariableCollection;
  modeId: string;
  aliases: {[key:string]: AliasType};
  tokens: {[key:string]: any};
};

function processAliases({ collection, modeId, aliases, tokens }: AliasProccessed) {
  const aliases_ = Object.values(aliases);
  let generations = aliases_.length;
  while (aliases.length && generations > 0) {
    for (let i = 0; i < aliases_.length; i++) {
      const { key, type, valueKey } = aliases[i];
      const token = tokens[valueKey];
      if (token) {
        aliases_.splice(i, 1);
        tokens[key] = createVariable({collection, modeId, name: key, key, valueKey, tokens});
      }
    }
    generations--;
  }
}

function isAlias(value: VariableValue) {
  return value.toString().trim().charAt(0) === "{";
}

type TokenForTraverse = {
  collection: VariableCollection;
  modeId: string;
  type: 'color' | 'number';
  key: string;
  object: any;
  tokens: {[key:string]: any};
  aliases: {[key:string]: AliasType};
};

function traverseToken({
  collection,
  modeId,
  type,
  key,
  object,
  tokens,
  aliases,
}: TokenForTraverse) {
  type = type || object.$type;
  // if key is a meta field, move on
  if (key.charAt(0) === "$") {
    return;
  }
  if (object.$value !== undefined) {
    if (isAlias(object.$value)) {
      const valueKey = object.$value
        .trim()
        .replace(/\./g, "/")
        .replace(/[\{\}]/g, "");
      if (tokens[valueKey]) {
        tokens[key] = createVariable({collection, modeId, key, valueKey, tokens});
      } else {
        aliases[key] = {
          key,
          type: 'VARIABLE_ALIAS',
          valueKey,
        };
      }
    } else if (type === "color") {
      tokens[key] = createToken({
        collection,
        modeId,
        type: "COLOR",
        name: key,
        value: parseColor(object.$value)
      });
    } else if (type === "number") {
      tokens[key] = createToken({
        collection,
        modeId,
        type: "FLOAT",
        name: key,
        value: object.$value
      });
    } else {
      console.log("unsupported type", type, object);
    }
  } else {
    Object.entries(object).forEach(([key2, object2]) => {
      if (key2.charAt(0) !== "$") {
        traverseToken({
          collection,
          modeId,
          type,
          key: `${key}/${key2}`,
          object: object2,
          tokens,
          aliases,
        });
      }
    });
  }
}

// execute Plugin

figma.ui.onmessage = (e) => {
  console.log("code received", e);
  if (e.type === 'EXPORT') {
    exportToJSON();
  } else if (e.type === 'IMPORT') {
    const { fileName, body } = e;
    importJSONFile({ fileName, body });
  }
}

// Export JSON

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

function parseColor(color: string) {
  color = color.trim();
  const rgbRegex = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;
  const rgbaRegex =
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([\d.]+)\s*\)$/;
  const hslRegex = /^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/;
  const hslaRegex =
    /^hsla\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*,\s*([\d.]+)\s*\)$/;
  const hexRegex = /^#([A-Fa-f0-9]{3}){1,2}$/;
  const floatRgbRegex =
    /^\{\s*r:\s*[\d\.]+,\s*g:\s*[\d\.]+,\s*b:\s*[\d\.]+(,\s*opacity:\s*[\d\.]+)?\s*\}$/;

  if (rgbRegex.test(color)) {
    const [, r, g, b] = color.match(rgbRegex) as any;
    return { r: parseInt(r) / 255, g: parseInt(g) / 255, b: parseInt(b) / 255 };
  } else if (rgbaRegex.test(color)) {
    const [, r, g, b, a] = color.match(rgbaRegex) as any;
    return {
      r: parseInt(r) / 255,
      g: parseInt(g) / 255,
      b: parseInt(b) / 255,
      a: parseFloat(a),
    };
  } else if (hslRegex.test(color)) {
    const [, h, s, l] = color.match(hslRegex) as any;
    return hslToRgbFloat(parseInt(h), parseInt(s) / 100, parseInt(l) / 100);
  } else if (hslaRegex.test(color)) {
    const [, h, s, l, a] = color.match(hslaRegex) as any;
    return Object.assign(
      hslToRgbFloat(parseInt(h), parseInt(s) / 100, parseInt(l) / 100),
      { a: parseFloat(a) }
    );
  } else if (hexRegex.test(color)) {
    const hexValue = color.substring(1);
    const expandedHex =
      hexValue.length === 3
        ? hexValue
            .split("")
            .map((char) => char + char)
            .join("")
        : hexValue;
    return {
      r: parseInt(expandedHex.slice(0, 2), 16) / 255,
      g: parseInt(expandedHex.slice(2, 4), 16) / 255,
      b: parseInt(expandedHex.slice(4, 6), 16) / 255,
    };
  } else if (floatRgbRegex.test(color)) {
    return JSON.parse(color);
  } else {
    throw new Error("Invalid color format");
  }
}

function hslToRgbFloat(h: any, s: any, l: any) {
  const hue2rgb = (p: any, q: any, t: any) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  if (s === 0) {
    return { r: l, g: l, b: l };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, (h + 1 / 3) % 1);
  const g = hue2rgb(p, q, h % 1);
  const b = hue2rgb(p, q, (h - 1 / 3) % 1);

  return { r, g, b };
}
