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

    def parse(self, response):
        anchors = []
        for li in response.css("div[id=dlpage] ul li"):
            href = li.css("a::attr(href)").get()
            if href and "item" in href:
                anchors.append(int(href.split("item")[-1]))

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

            subjects_text = paper_dd.css(".list-subjects .primary-subject::text").get()
            if not subjects_text:
                subjects_text = paper_dd.css(".list-subjects::text").get()

            if subjects_text:
                categories_in_paper = re.findall(r'\(([^)]+)\)', subjects_text)
                paper_categories = set(categories_in_paper)
                if paper_categories.intersection(self.target_categories):
                    yield {"id": arxiv_id, "categories": list(paper_categories)}
                else:
                    self.logger.debug(
                        f"Skipped {arxiv_id} with categories {paper_categories}"
                    )
            else:
                self.logger.warning(
                    f"Could not extract categories for {arxiv_id}, including anyway"
                )
                yield {"id": arxiv_id, "categories": []}
