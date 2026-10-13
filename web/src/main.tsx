import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import "katex/dist/katex.min.css";
import "./index.css";
import { AppShell } from "./components/AppShell";
import { Home } from "./pages/Home";
import { LectureView } from "./pages/LectureView";
import { ModulePage } from "./pages/ModulePage";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/modules/:id">{(params) => <ModulePage id={params.id} />}</Route>
          <Route path="/lectures/:id">{(params) => <LectureView key={params.id} id={params.id} />}</Route>
          <Route>
            <p className="p-12 text-sm text-muted">Page not found.</p>
          </Route>
        </Switch>
      </AppShell>
    </QueryClientProvider>
  </StrictMode>,
);
