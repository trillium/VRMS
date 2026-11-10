import SpaLoader from './SpaLoader';

// Catch-all for every URL that is not a static file or /api/*. The existing React
// Router app owns routing from here, so a deep link such as /events gets the same
// page shell as / and the router picks the screen in the browser.
export default function Page() {
  return <SpaLoader />;
}
