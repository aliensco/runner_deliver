export {};

declare global {
  namespace Express {
    interface Request {
      auth?: {
        id: number;
        username: string;
        role: "admin" | "merchant" | "rider";
        displayName: string;
        merchantId: number | null;
        riderId: number | null;
      };
    }
  }
}
