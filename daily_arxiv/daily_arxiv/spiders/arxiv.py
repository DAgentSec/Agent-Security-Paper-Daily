import scrapy
import os
import re


class ArxivSpider(scrapy.Spider):
    name = "arxiv"
    allowed_domains = ["arxiv.org"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        categories = os.environ.get("CATEGORIES", "cs.CR,cs.AI")
        self.target_categories = set(cat.strip() for cat in categories.split(","))
        self.start_urls = [
            f"https://arxiv.org/list/{cat}/new" for cat in self.target_categories
        ]

        try:
            self.max_papers = int(os.environ.get("MAX_PAPERS", "0"))
        except ValueError:
            self.max_papers = 0

        kw_raw = os.environ.get("KEYWORDS", "")
        self.keywords = [k.strip().lower() for k in kw_raw.split(",") if k.strip()]

    def _score(self, title: str, subjects: str) -> int:
        if not self.keywords:
            return 0
        text = (title + " " + subjects).lower()
        return sum(1 for kw in self.keywords if kw in text)

    def parse(self, response):
        # Collect new-submission anchor IDs to know where "new" ends
        anchors = []
        for li in response.css("div[id=dlpage] ul li"):
            href = li.css("a::attr(href)").get()
            if href and "item" in href:
                anchors.append(int(href.split("item")[-1]))

        candidates = []

        for paper in response.css("dl dt"):
            paper_anchor = paper.css("a[name^='item']::attr(name)").get()
            if not paper_anchor:
                continue

            paper_id = int(paper_anchor.split("item")[-1])
            if anchors and paper_id >= anchors[-1]:
                continue

            abstract_link = paper.css("a[title='Abstract']::attr(href)").get()
            if not abstract_link:
                continue

            arxiv_id = abstract_link.split("/")[-1]
            paper_dd = paper.xpath("following-sibling::dd[1]")
            if not paper_dd:
                continue

            # Title is available on the listing page — used for keyword scoring
            title_text = (paper_dd.css(".list-title::text").get() or "").strip()

            subjects_text = paper_dd.css(".list-subjects .primary-subject::text").get()
            if not subjects_text:
                subjects_text = paper_dd.css(".list-subjects::text").get() or ""

            categories_in_paper = set(re.findall(r'\(([^)]+)\)', subjects_text))

            if categories_in_paper.intersection(self.target_categories):
                candidates.append({
                    "id": arxiv_id,
                    "categories": list(categories_in_paper),
                    "_score": self._score(title_text, subjects_text),
                })
            elif not subjects_text.strip():
                self.logger.warning(f"No categories for {arxiv_id}, including with score 0")
                candidates.append({
                    "id": arxiv_id,
                    "categories": [],
                    "_score": 0,
                })
            else:
                self.logger.debug(f"Skipped {arxiv_id} — categories {categories_in_paper} not in target")

        # Sort: keyword-matched papers first, then by original order (stable sort preserves it)
        candidates.sort(key=lambda x: x["_score"], reverse=True)

        if self.max_papers > 0:
            kept = candidates[:self.max_papers]
            self.logger.info(
                f"MAX_PAPERS={self.max_papers}: keeping {len(kept)}/{len(candidates)} papers "
                f"({sum(1 for c in kept if c['_score'] > 0)} keyword-matched)"
            )
            candidates = kept

        for item in candidates:
            item.pop("_score", None)
            yield item
