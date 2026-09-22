import { Bonjour, type Service } from 'bonjour-service';
import type { MdnsProvider } from '../../ports';

const SERVICE_TYPE = 'ethertransfer';

export function createNodeMdnsProvider(): MdnsProvider {
  const bonjour = new Bonjour();
  let published: ReturnType<Bonjour['publish']> | undefined;
  let browser: ReturnType<Bonjour['find']> | undefined;

  return {
    advertise({ name, port, txt }) {
      // Re-advertising (after a rename) replaces the old record instead of
      // leaving both answering queries.
      published?.stop();
      published = bonjour.publish({ name, type: SERVICE_TYPE, port, txt });
    },

    browse(onFound) {
      browser = bonjour.find({ type: SERVICE_TYPE }, (service: Service) => {
        const address = service.referer?.address ?? service.addresses?.[0];
        if (!address) return;
        onFound(service.txt as Record<string, string>, address, service.port);
      });
    },

    stop() {
      published?.stop();
      browser?.stop();
      bonjour.destroy();
    },
  };
}
