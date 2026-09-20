/**
 * Sanitizes emergency request objects based on authorization.
 * If isAuthorized is false: precise coordinates (preciseLat, preciseLng)
 * and contact phone (contactPhone) are stripped.
 */
export function sanitizeRequest(doc: any, isAuthorized: boolean = false) {
  const obj = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (isAuthorized) {
    return obj;
  }
  const sanitized = {
    ...obj,
    location: {
      publicLat: obj.location?.publicLat,
      publicLng: obj.location?.publicLng,
    },
  };
  delete sanitized.contactPhone;
  if (sanitized.location) {
    delete sanitized.location.preciseLat;
    delete sanitized.location.preciseLng;
  }
  return sanitized;
}
