import scrapy


class DailyArxivItem(scrapy.Item):
    id = scrapy.Field()
    title = scrapy.Field()
    authors = scrapy.Field()
    summary = scrapy.Field()
    categories = scrapy.Field()
    comment = scrapy.Field()
    abs = scrapy.Field()
    pdf = scrapy.Field()
    source_type = scrapy.Field()
    catalog = scrapy.Field()
