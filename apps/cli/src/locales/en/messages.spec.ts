import * as fs from "fs";
import * as path from "path";

import { TranslationService } from "@bitwarden/common/platform/services/translation.service";

const en = JSON.parse(fs.readFileSync(path.join(__dirname, "messages.json"), "utf8"));

class TestTranslationService extends TranslationService {
  constructor() {
    super("en", ".", () => Promise.resolve(en));
  }
}

describe("en messages.json $N$ interpolation", () => {
  let service: TestTranslationService;

  beforeEach(async () => {
    service = new TestTranslationService();
    await service.init();
  });

  it("interpolates the register success messages", () => {
    expect(service.t("bwadminAccountCreatedFor1", "user@example.com")).toEqual(
      "Account created for user@example.com.",
    );
    expect(service.t("bwadminInitialPassword1", "generated-password")).toEqual(
      "Initial password: generated-password",
    );
  });

  it("declares placeholders for every message containing $1$", () => {
    for (const [key, entry] of Object.entries<any>(en)) {
      if (entry.message.includes("$1$")) {
        expect(entry.placeholders?.["1"]?.content).toEqual("$1");
      }
    }
  });
});
