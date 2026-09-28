/** Only expose Boolean inputs whose runtime declaration is unambiguous. */
export function previewBooleanControls(component, sourceProps) {
  const declarations = component.props;
  if (!declarations || Array.isArray(declarations)) return [];
  const controls = [];
  for (const [name, declaration] of Object.entries(declarations)) {
    const type = declaration === Boolean ? Boolean : declaration?.type;
    if (type !== Boolean) continue;
    const value = Object.hasOwn(sourceProps, name) ? sourceProps[name] : declaration === Boolean ? false : declaration.default ?? false;
    if (typeof value === 'boolean') controls.push({name, value});
  }
  return controls;
}

/** Bind only evidenced model contracts; business events have no synthetic response. */
export function previewModelListeners(component, sourceProps, vueMajor, writeProp) {
  const declaredProps = Array.isArray(component.props) ? component.props : Object.keys(component.props || {});
  const declaredEvents = Array.isArray(component.emits) ? component.emits : Object.keys(component.emits || {});
  const listeners = {};
  for (const name of declaredProps) {
    const event = 'update:' + name;
    if (Object.hasOwn(sourceProps, name) && declaredEvents.includes(event)) listeners[event] = value => writeProp(name, value);
  }
  if (vueMajor === 2) {
    const model = component.model;
    // Vue 2 transformModel defines value/input when no custom model is declared.
    const prop = model?.prop || 'value';
    const event = model?.event || 'input';
    if (typeof prop === 'string' && typeof event === 'string' && declaredProps.includes(prop) && Object.hasOwn(sourceProps, prop)) {
      listeners[event] = value => writeProp(prop, value);
    }
  }
  return listeners;
}
