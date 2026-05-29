import { Link } from "@tanstack/react-router";
import { BookOpenCheck } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-primary text-primary-foreground border-b-4 border-secondary">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <BookOpenCheck className="h-8 w-8 text-secondary" />
            <div className="leading-tight">
              <div className="text-xl font-bold tracking-wide">Questão de Sucesso</div>
              <div className="text-xs text-secondary/90">Questões comentadas para concursos</div>
            </div>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium">
            <NavLink to="/">Temas</NavLink>
            <NavLink to="/questions">Cadastrar questões</NavLink>
            <NavLink to="/questions-list">Listar questões</NavLink>
            <NavLink to="/export">Exportar</NavLink>
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-6 py-8">{children}</main>
      <footer className="border-t bg-primary text-primary-foreground/80 mt-12">
        <div className="container mx-auto px-6 py-4 text-center text-xs">
          <span className="text-secondary font-semibold">Estude por questões.</span>{" "}
          Aprenda na prática. Seja aprovado.
        </div>
      </footer>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-3 py-2 rounded-md hover:bg-white/10 transition-colors"
      activeProps={{ className: "px-3 py-2 rounded-md bg-secondary text-secondary-foreground" }}
    >
      {children}
    </Link>
  );
}
