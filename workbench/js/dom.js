export const $ = (id) => document.getElementById(id);

export const option = (value) => Object.assign(document.createElement("option"), { value, textContent: value });

export const number = (value) => (value === null ? "n/a" : value);
