// An imported image file is a URL string under Vite but an object
// ({ src, width, height }) under Next. This returns the URL either way.
export const assetUrl = (asset) => (typeof asset === 'string' ? asset : asset.src);
