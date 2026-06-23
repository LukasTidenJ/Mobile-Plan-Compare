import { Switch, Route, Router as WouterRouter } from "wouter";
import { Analytics } from "@vercel/analytics/react";
import Home from "./pages/home";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
      <Analytics />
    </WouterRouter>
  );
}

export default App;
