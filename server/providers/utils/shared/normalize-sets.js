const normalizeSets = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(normalizeSets);
  } else if (obj !== null && typeof obj === "object") {
    if (obj instanceof Set) {
      return [...obj];
    }
    const res = {};
    Object.keys(obj).forEach((key) => {
      res[key] = normalizeSets(obj[key]);
    });
    return res;
  }
  return obj;
};

module.exports = normalizeSets