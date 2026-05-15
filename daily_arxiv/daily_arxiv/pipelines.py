import arxiv
from .catalog_classifier import classify_catalog


class DailyArxivPipeline:
    def __init__(self):
        self.page_size = 100
        self.client = arxiv.Client(self.page_size)

    def process_item(self, item: dict, spider):
        item["pdf"] = f"https://arxiv.org/pdf/{item['id']}"
        item["abs"] = f"https://arxiv.org/abs/{item['id']}"

        search = arxiv.Search(id_list=[item["id"]])
        paper = next(self.client.results(search))

        item["authors"] = [a.name for a in paper.authors]
        item["title"] = paper.title
        item["categories"] = paper.categories
        item["comment"] = paper.comment
        item["summary"] = paper.summary
        item["source_type"] = "arxiv"
        item["catalog"] = classify_catalog(paper.title, paper.summary)

        return item
