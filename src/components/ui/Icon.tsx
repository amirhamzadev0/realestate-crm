import {
  BadgeDollarSign,
  Boxes,
  Building2,
  ChartNoAxesColumn,
  ClipboardCheck,
  Crown,
  Handshake,
  HardHat,
  LayoutDashboard,
  Megaphone,
  Truck,
  UserRoundCheck,
  Users,
  UsersRound,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  BadgeDollarSign,
  Boxes,
  Building2,
  ChartNoAxesColumn,
  ClipboardCheck,
  Crown,
  Handshake,
  HardHat,
  LayoutDashboard,
  Megaphone,
  Truck,
  UserRoundCheck,
  Users,
  UsersRound,
  Wallet,
  Warehouse,
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Component = icons[name] ?? LayoutDashboard;
  return <Component size={size} aria-hidden="true" />;
}
