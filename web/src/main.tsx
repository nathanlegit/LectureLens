import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import "katex/dist/katex.min.css";
import "./index.css";
import { LectureView } from "./pages/LectureView";
import { ModuleList } from "./pages/ModuleList";

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={ModuleList} />
        <Route path="/lectures/:id">{(params) => <LectureView id={params.id} />}</Route>
        <Route>
          <p className="p-6 text-sm">Page not found.</p>
        </Route>
      </Switch>
    </QueryClientProvider>
  </StrictMode>,
);
