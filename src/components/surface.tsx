// Marks a subtree that sits on a brand surface (a lime or off-white card) whose colours do not change with the
// appearance. Inside it, default text stays ink and ink buttons stay ink with lime text, in light and dark mode alike.
import { createContext, useContext, type ReactNode } from 'react';

const BrandSurfaceCtx = createContext(false);

export function OnBrand({ children }: { children: ReactNode }) {
  return <BrandSurfaceCtx.Provider value>{children}</BrandSurfaceCtx.Provider>;
}

export function useOnBrand(): boolean {
  return useContext(BrandSurfaceCtx);
}
