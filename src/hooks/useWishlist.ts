import { useEffect, useState } from "react";

export const WISHLIST_STORAGE_KEY = "hidden-gems-wishlist";

export function useWishlist() {
  const [wishlist, setWishlist] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setWishlist(parsed.map((id) => String(id)));
      }
    } catch (error) {
      console.error("Failed to load wishlist from localStorage", error);
    }
  }, []);

  const toggle = (id: string | number) => {
    const idStr = String(id);
    setWishlist((current) => {
      const exists = current.includes(idStr);
      const next = exists
        ? current.filter((x) => x !== idStr)
        : [...current, idStr];

      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(next));
        }
      } catch (error) {
        console.error("Failed to save wishlist to localStorage", error);
      }

      return next;
    });
  };

  const isWished = (id: string | number) => {
    const idStr = String(id);
    return wishlist.includes(idStr);
  };

  return { wishlist, toggle, isWished };
}
