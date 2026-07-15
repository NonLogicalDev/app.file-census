use serde::{Deserialize, Serialize};

pub const FILE_SEARCH_DEFAULT_LIMIT: u32 = 200;
pub const FILE_SEARCH_MAX_LIMIT: u32 = 500;

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct FileSearchQuery {
    pub filter: Option<FileSearchFilter>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub representative_only: Option<bool>,
    pub scan_ids: Option<Vec<String>>,
}

impl FileSearchQuery {
    pub fn effective_limit(&self) -> u32 {
        self.limit
            .unwrap_or(FILE_SEARCH_DEFAULT_LIMIT)
            .min(FILE_SEARCH_MAX_LIMIT)
    }

    pub fn effective_offset(&self) -> u32 {
        self.offset.unwrap_or(0)
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct FileSearchFilter {
    pub term: FileSearchTerm,
    pub operator: FileSearchOperator,
    pub expression: FileSearchExpression,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FileSearchTerm {
    Filter,
    Text,
    Name,
    Path,
    Extension,
    LocationSlug,
    LocationName,
    Kind,
    Ctime,
    Mtime,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FileSearchOperator {
    And,
    Or,
    Not,
    Equal,
    NotEqual,
    Substring,
    NotSubstring,
    Regex,
    NotRegex,
    Fuzzy,
    NotFuzzy,
    After,
    Before,
    Between,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(untagged)]
pub enum FileSearchExpression {
    Filters(Vec<FileSearchFilter>),
    Filter(Box<FileSearchFilter>),
    Range { from: String, to: String },
    String(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_search_query_accepts_canonical_composable_filter_ast() {
        let query = serde_json::from_value::<FileSearchQuery>(serde_json::json!({
            "filter": {
                "term": "filter",
                "operator": "and",
                "expression": [
                    { "term": "text", "operator": "substring", "expression": "invoice" },
                    { "term": "extension", "operator": "equal", "expression": "jpg" },
                    {
                        "term": "filter",
                        "operator": "not",
                        "expression": { "term": "location_slug", "operator": "equal", "expression": "scratch" }
                    }
                ]
            },
            "limit": 50,
            "offset": 10
        }))
        .unwrap();

        assert_eq!(query.effective_limit(), 50);
        assert_eq!(query.effective_offset(), 10);
        assert!(matches!(
            query.filter.unwrap().expression,
            FileSearchExpression::Filters(_)
        ));
    }

    #[test]
    fn file_search_query_rejects_legacy_filter_shapes() {
        assert!(
            serde_json::from_value::<FileSearchQuery>(serde_json::json!({
                "filter": {
                    "and": [
                        { "field": "text", "op": "contains", "value": "invoice" }
                    ]
                }
            }))
            .is_err()
        );

        assert!(
            serde_json::from_value::<FileSearchQuery>(serde_json::json!({
                "filter": { "field": "text", "op": "contains", "value": "invoice" }
            }))
            .is_err()
        );
    }
}
